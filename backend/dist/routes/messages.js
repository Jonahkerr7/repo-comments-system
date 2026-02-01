"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const logger_1 = require("../logger");
const router = (0, express_1.Router)();
// Add a message to a thread
router.post('/:threadId/messages', auth_1.authenticate, (0, auth_1.authorize)('write'), [
    (0, express_validator_1.param)('threadId').isUUID().withMessage('Invalid thread ID'),
    (0, express_validator_1.body)('repo').notEmpty().withMessage('Repository is required'),
    (0, express_validator_1.body)('content').notEmpty().trim().withMessage('Message content is required'),
    (0, express_validator_1.body)('parent_message_id').optional().isUUID(),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        logger_1.logger.error('Message creation validation failed', { errors: errors.array(), body: req.body });
        return res.status(400).json({ errors: errors.array() });
    }
    const { threadId } = req.params;
    const authReq = req;
    const data = req.body;
    try {
        // Verify thread exists
        const threadCheck = await (0, db_1.query)('SELECT id, repo FROM threads WHERE id = $1', [threadId]);
        if (threadCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Thread not found' });
        }
        // Extract mentions from content (e.g., @username)
        const mentionPattern = /@(\w+)/g;
        const mentions = [];
        let match;
        while ((match = mentionPattern.exec(data.content)) !== null) {
            const username = match[1];
            // Try to find user by email or name
            const userResult = await (0, db_1.query)(`SELECT id FROM users
           WHERE email LIKE $1 OR name LIKE $1`, [`%${username}%`]);
            if (userResult.rows.length > 0) {
                mentions.push(userResult.rows[0].id);
            }
        }
        // Create message
        const messageResult = await (0, db_1.query)(`INSERT INTO messages (
          thread_id, author_id, content, parent_message_id, mentions
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *`, [
            threadId,
            authReq.user.id,
            data.content,
            data.parent_message_id || null,
            mentions,
        ]);
        const message = messageResult.rows[0];
        // Create notifications for mentions
        if (mentions.length > 0) {
            for (const userId of mentions) {
                await (0, db_1.query)(`INSERT INTO notifications (user_id, thread_id, message_id, type, content)
             VALUES ($1, $2, $3, $4, $5)`, [
                    userId,
                    threadId,
                    message.id,
                    'mention',
                    `${authReq.user.name} mentioned you in a comment`,
                ]);
            }
        }
        // Update thread's updated_at timestamp
        await (0, db_1.query)('UPDATE threads SET updated_at = NOW() WHERE id = $1', [threadId]);
        // Log audit event
        await (0, db_1.query)(`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata)
         VALUES ($1, $2, $3, $4, $5)`, [
            authReq.user.id,
            'message.added',
            'message',
            message.id,
            JSON.stringify({ thread_id: threadId }),
        ]);
        logger_1.logger.info('Message added', {
            messageId: message.id,
            threadId,
            userId: authReq.user.id,
        });
        res.status(201).json(message);
    }
    catch (error) {
        logger_1.logger.error('Error creating message', error);
        res.status(500).json({ error: 'Failed to create message' });
    }
});
// Update a message (edit)
router.patch('/:threadId/messages/:messageId', auth_1.authenticate, [
    (0, express_validator_1.param)('threadId').isUUID().withMessage('Invalid thread ID'),
    (0, express_validator_1.param)('messageId').isUUID().withMessage('Invalid message ID'),
    (0, express_validator_1.body)('content').notEmpty().trim().withMessage('Message content is required'),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { threadId, messageId } = req.params;
    const { content } = req.body;
    const authReq = req;
    try {
        // Verify message exists and user is the author
        const messageCheck = await (0, db_1.query)('SELECT * FROM messages WHERE id = $1 AND thread_id = $2', [messageId, threadId]);
        if (messageCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }
        const message = messageCheck.rows[0];
        if (message.author_id !== authReq.user.id) {
            return res.status(403).json({ error: 'You can only edit your own messages' });
        }
        // Update message
        const result = await (0, db_1.query)(`UPDATE messages
         SET content = $1, edited = true, updated_at = NOW()
         WHERE id = $2
         RETURNING *`, [content, messageId]);
        logger_1.logger.info('Message edited', {
            messageId,
            threadId,
            userId: authReq.user.id,
        });
        res.json(result.rows[0]);
    }
    catch (error) {
        logger_1.logger.error('Error updating message', error);
        res.status(500).json({ error: 'Failed to update message' });
    }
});
// Delete a message
router.delete('/:threadId/messages/:messageId', auth_1.authenticate, async (req, res) => {
    const { threadId, messageId } = req.params;
    const authReq = req;
    try {
        // Verify message exists
        const messageCheck = await (0, db_1.query)('SELECT * FROM messages WHERE id = $1 AND thread_id = $2', [messageId, threadId]);
        if (messageCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }
        const message = messageCheck.rows[0];
        // Only author or admin can delete
        const isAuthor = message.author_id === authReq.user.id;
        // TODO: Check if user is admin for the repo
        if (!isAuthor) {
            return res.status(403).json({
                error: 'You can only delete your own messages',
            });
        }
        await (0, db_1.query)('DELETE FROM messages WHERE id = $1', [messageId]);
        logger_1.logger.info('Message deleted', {
            messageId,
            threadId,
            userId: authReq.user.id,
        });
        res.status(204).send();
    }
    catch (error) {
        logger_1.logger.error('Error deleting message', error);
        res.status(500).json({ error: 'Failed to delete message' });
    }
});
// Add a reaction to a message
router.post('/:threadId/messages/:messageId/reactions', auth_1.authenticate, [
    (0, express_validator_1.param)('threadId').isUUID(),
    (0, express_validator_1.param)('messageId').isUUID(),
    (0, express_validator_1.body)('emoji').notEmpty().withMessage('Emoji is required'),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { messageId } = req.params;
    const { emoji } = req.body;
    const authReq = req;
    try {
        const result = await (0, db_1.query)(`INSERT INTO reactions (message_id, user_id, emoji)
         VALUES ($1, $2, $3)
         ON CONFLICT (message_id, user_id, emoji) DO NOTHING
         RETURNING *`, [messageId, authReq.user.id, emoji]);
        if (result.rows.length === 0) {
            return res.status(200).json({ message: 'Reaction already exists' });
        }
        res.status(201).json(result.rows[0]);
    }
    catch (error) {
        logger_1.logger.error('Error adding reaction', error);
        res.status(500).json({ error: 'Failed to add reaction' });
    }
});
// Remove a reaction from a message
router.delete('/:threadId/messages/:messageId/reactions/:emoji', auth_1.authenticate, async (req, res) => {
    const { messageId, emoji } = req.params;
    const authReq = req;
    try {
        await (0, db_1.query)('DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3', [messageId, authReq.user.id, emoji]);
        res.status(204).send();
    }
    catch (error) {
        logger_1.logger.error('Error removing reaction', error);
        res.status(500).json({ error: 'Failed to remove reaction' });
    }
});
exports.default = router;
//# sourceMappingURL=messages.js.map