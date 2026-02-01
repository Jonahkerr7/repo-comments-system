import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticate, authorize } from '../middleware/auth';
import { query } from '../db';
import { Message, CreateMessageRequest, AuthenticatedRequest } from '../types';
import { logger } from '../logger';
import { Server } from 'socket.io';

const router = Router();

// Add a message to a thread
router.post(
  '/:threadId/messages',
  authenticate,
  authorize('write'),
  [
    param('threadId').isUUID().withMessage('Invalid thread ID'),
    body('repo').notEmpty().withMessage('Repository is required'),
    body('content').notEmpty().trim().withMessage('Message content is required'),
    body('parent_message_id').optional().isUUID(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.error('Message creation validation failed', { errors: errors.array(), body: req.body });
      return res.status(400).json({ errors: errors.array() });
    }

    const { threadId } = req.params;
    const authReq = req as unknown as AuthenticatedRequest;
    const data: CreateMessageRequest = req.body;

    try {
      // Verify thread exists
      const threadCheck = await query(
        'SELECT id, repo FROM threads WHERE id = $1',
        [threadId]
      );

      if (threadCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      // Extract mentions from content (e.g., @username)
      const mentionPattern = /@(\w+)/g;
      const mentions: string[] = [];
      let match;

      while ((match = mentionPattern.exec(data.content)) !== null) {
        const username = match[1];
        // Try to find user by email or name
        const userResult = await query(
          `SELECT id FROM users
           WHERE email LIKE $1 OR name LIKE $1`,
          [`%${username}%`]
        );

        if (userResult.rows.length > 0) {
          mentions.push(userResult.rows[0].id);
        }
      }

      // Create message
      const messageResult = await query<Message>(
        `INSERT INTO messages (
          thread_id, author_id, content, parent_message_id, mentions
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [
          threadId,
          authReq.user!.id,
          data.content,
          data.parent_message_id || null,
          mentions,
        ]
      );

      const message = messageResult.rows[0];

      // Create notifications for mentions
      if (mentions.length > 0) {
        for (const userId of mentions) {
          await query(
            `INSERT INTO notifications (user_id, thread_id, message_id, type, content)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              userId,
              threadId,
              message.id,
              'mention',
              `${authReq.user!.name} mentioned you in a comment`,
            ]
          );
        }
      }

      // Update thread's updated_at timestamp
      await query('UPDATE threads SET updated_at = NOW() WHERE id = $1', [threadId]);

      // Log audit event
      await query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          authReq.user!.id,
          'message.added',
          'message',
          message.id,
          JSON.stringify({ thread_id: threadId }),
        ]
      );

      // Broadcast via WebSocket
      const io: Server = req.app.locals.io;
      if (io) {
        const thread = threadCheck.rows[0];
        io.to(thread.repo).emit('message:added', {
          threadId,
          message: {
            ...message,
            author_name: authReq.user!.name,
            author_email: authReq.user!.email,
            author_avatar: authReq.user!.avatar_url,
            reactions: [],
          },
        });
      }

      logger.info('Message added', {
        messageId: message.id,
        threadId,
        userId: authReq.user!.id,
      });

      res.status(201).json(message);
    } catch (error) {
      logger.error('Error creating message', error);
      res.status(500).json({ error: 'Failed to create message' });
    }
  }
);

// Update a message (edit)
router.patch(
  '/:threadId/messages/:messageId',
  authenticate,
  [
    param('threadId').isUUID().withMessage('Invalid thread ID'),
    param('messageId').isUUID().withMessage('Invalid message ID'),
    body('content').notEmpty().trim().withMessage('Message content is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { threadId, messageId } = req.params;
    const { content } = req.body;
    const authReq = req as unknown as AuthenticatedRequest;

    try {
      // Verify message exists and user is the author
      const messageCheck = await query<Message>(
        'SELECT * FROM messages WHERE id = $1 AND thread_id = $2',
        [messageId, threadId]
      );

      if (messageCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const message = messageCheck.rows[0];

      if (message.author_id !== authReq.user!.id) {
        return res.status(403).json({ error: 'You can only edit your own messages' });
      }

      // Update message
      const result = await query<Message>(
        `UPDATE messages
         SET content = $1, edited = true, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [content, messageId]
      );

      // Get thread for broadcasting
      const threadResult = await query('SELECT repo FROM threads WHERE id = $1', [threadId]);
      const io: Server = req.app.locals.io;
      if (io && threadResult.rows.length > 0) {
        io.to(threadResult.rows[0].repo).emit('message:edited', {
          threadId,
          messageId,
          content,
          edited: true,
        });
      }

      logger.info('Message edited', {
        messageId,
        threadId,
        userId: authReq.user!.id,
      });

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error updating message', error);
      res.status(500).json({ error: 'Failed to update message' });
    }
  }
);

// Delete a message
router.delete(
  '/:threadId/messages/:messageId',
  authenticate,
  async (req, res) => {
    const { threadId, messageId } = req.params;
    const authReq = req as unknown as AuthenticatedRequest;

    try {
      // Verify message exists
      const messageCheck = await query<Message>(
        'SELECT * FROM messages WHERE id = $1 AND thread_id = $2',
        [messageId, threadId]
      );

      if (messageCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const message = messageCheck.rows[0];

      // Only author or admin can delete
      const isAuthor = message.author_id === authReq.user!.id;
      // TODO: Check if user is admin for the repo

      if (!isAuthor) {
        return res.status(403).json({
          error: 'You can only delete your own messages',
        });
      }

      // Get thread for broadcasting before deletion
      const threadResult = await query('SELECT repo FROM threads WHERE id = $1', [threadId]);

      await query('DELETE FROM messages WHERE id = $1', [messageId]);

      // Broadcast via WebSocket
      const io: Server = req.app.locals.io;
      if (io && threadResult.rows.length > 0) {
        io.to(threadResult.rows[0].repo).emit('message:deleted', {
          threadId,
          messageId,
        });
      }

      logger.info('Message deleted', {
        messageId,
        threadId,
        userId: authReq.user!.id,
      });

      res.status(204).send();
    } catch (error) {
      logger.error('Error deleting message', error);
      res.status(500).json({ error: 'Failed to delete message' });
    }
  }
);

// Add a reaction to a message
router.post(
  '/:threadId/messages/:messageId/reactions',
  authenticate,
  [
    param('threadId').isUUID(),
    param('messageId').isUUID(),
    body('emoji').notEmpty().withMessage('Emoji is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { messageId } = req.params;
    const { emoji } = req.body;
    const authReq = req as unknown as AuthenticatedRequest;

    try {
      const result = await query(
        `INSERT INTO reactions (message_id, user_id, emoji)
         VALUES ($1, $2, $3)
         ON CONFLICT (message_id, user_id, emoji) DO NOTHING
         RETURNING *`,
        [messageId, authReq.user!.id, emoji]
      );

      if (result.rows.length === 0) {
        return res.status(200).json({ message: 'Reaction already exists' });
      }

      // Broadcast via WebSocket
      const threadResult = await query(
        'SELECT t.repo FROM threads t JOIN messages m ON m.thread_id = t.id WHERE m.id = $1',
        [messageId]
      );
      const io: Server = req.app.locals.io;
      if (io && threadResult.rows.length > 0) {
        io.to(threadResult.rows[0].repo).emit('reaction:added', {
          messageId,
          reaction: {
            ...result.rows[0],
            user_name: authReq.user!.name,
          },
        });
      }

      res.status(201).json(result.rows[0]);
    } catch (error) {
      logger.error('Error adding reaction', error);
      res.status(500).json({ error: 'Failed to add reaction' });
    }
  }
);

// Remove a reaction from a message
router.delete(
  '/:threadId/messages/:messageId/reactions/:emoji',
  authenticate,
  async (req, res) => {
    const { messageId, emoji } = req.params;
    const authReq = req as unknown as AuthenticatedRequest;

    try {
      // Get thread for broadcasting before deletion
      const threadResult = await query(
        'SELECT t.repo FROM threads t JOIN messages m ON m.thread_id = t.id WHERE m.id = $1',
        [messageId]
      );

      await query(
        'DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
        [messageId, authReq.user!.id, emoji]
      );

      // Broadcast via WebSocket
      const io: Server = req.app.locals.io;
      if (io && threadResult.rows.length > 0) {
        io.to(threadResult.rows[0].repo).emit('reaction:removed', {
          messageId,
          emoji,
          userId: authReq.user!.id,
        });
      }

      res.status(204).send();
    } catch (error) {
      logger.error('Error removing reaction', error);
      res.status(500).json({ error: 'Failed to remove reaction' });
    }
  }
);

export default router;
