import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

interface Links {
  uxProjectIntake?: string;
  technologyRoadmap?: string;
  jtbd?: string;
  other?: string;
}

interface UploadedFile {
  name: string;
  type: string;
  content: string;
}

interface UserPathStep {
  question: string;
  answer: string;
}

interface ResearchMethod {
  name: string;
  leanCategory: string;
  description: string;
  timeRequired: string;
  requiresUsers: boolean;
  relevantLinks: string[];
}

// POST /api/v1/research/generate-recommendation
router.post('/generate-recommendation', async (req: Request, res: Response) => {
  try {
    const {
      userPath,
      recommendations,
      researchMethods,
      projectName,
      links,
      uploadedFiles,
    } = req.body;

    // Check if ANTHROPIC_API_KEY is set
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.json({
        recommendation: `**AI Insights Not Available**\n\nTo enable AI-powered recommendations, add your ANTHROPIC_API_KEY to the backend environment variables.\n\nIn the meantime, here are your recommended methods based on your selections:\n\n${recommendations
          .map((id: string) => {
            const method = researchMethods[id] as ResearchMethod;
            return method ? `- **${method.name}** (${method.timeRequired}): ${method.description}` : '';
          })
          .filter(Boolean)
          .join('\n\n')}`,
      });
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Build context from user's journey
    const pathSummary = (userPath as UserPathStep[])
      .map((step) => `- ${step.question}: ${step.answer}`)
      .join('\n');

    // Build method details
    const methodDetails = (recommendations as string[])
      .map((methodId: string) => {
        const method = researchMethods[methodId] as ResearchMethod;
        if (!method) return null;
        return `- ${method.name} (${method.leanCategory}, ${method.timeRequired}): ${method.description}`;
      })
      .filter(Boolean)
      .join('\n');

    // Build project context with links
    let projectContext = projectName ? `Project: ${projectName}` : 'No project context provided';

    if (links) {
      const linksList: string[] = [];
      const typedLinks = links as Links;
      if (typedLinks.uxProjectIntake) linksList.push(`- UX Project Intake: ${typedLinks.uxProjectIntake}`);
      if (typedLinks.technologyRoadmap) linksList.push(`- Technology Roadmap: ${typedLinks.technologyRoadmap}`);
      if (typedLinks.jtbd) linksList.push(`- Jobs To Be Done: ${typedLinks.jtbd}`);
      if (typedLinks.other) linksList.push(`- Other Documentation: ${typedLinks.other}`);

      if (linksList.length > 0) {
        projectContext += `\n\nProject Documentation Links:\n${linksList.join('\n')}`;
      }
    }

    // Build uploaded documents context
    let documentContext = '';
    if (uploadedFiles && Array.isArray(uploadedFiles) && uploadedFiles.length > 0) {
      const docSummaries: string[] = [];

      for (const file of uploadedFiles as UploadedFile[]) {
        if (file.type !== 'application/pdf' && file.content) {
          const truncatedContent = file.content.slice(0, 10000);
          docSummaries.push(`\n--- Document: ${file.name} ---\n${truncatedContent}\n--- End of ${file.name} ---`);
        } else if (file.type === 'application/pdf') {
          docSummaries.push(`\n[PDF Document: ${file.name} - content not directly readable, but referenced for context]`);
        }
      }

      if (docSummaries.length > 0) {
        documentContext = `\n\nUploaded Project Documents:\n${docSummaries.join('\n')}`;
      }
    }

    const hasLinks = links && Object.values(links as Links).some((link) => link);
    const hasFiles = uploadedFiles && Array.isArray(uploadedFiles) && uploadedFiles.length > 0;
    const hasContext = hasLinks || hasFiles;

    const contextInstructions = hasContext
      ? `
IMPORTANT: The user has provided project documentation. In your response:
- Reference the specific documents and their content when making recommendations
- Quote or paraphrase relevant sections from their uploaded documents when applicable
- Suggest how each research method can build upon or validate the information in their documents
- Tie your recommendations back to their existing project artifacts and goals mentioned in the documents`
      : '';

    const prompt = `You are a UX research expert helping a designer choose the right research method for their project.

${projectContext}
${documentContext}

Based on the user's answers:
${pathSummary}

The recommended research methods are:
${methodDetails}
${contextInstructions}

Please provide:
1. A brief (2-3 sentence) summary of why these methods are recommended given their specific situation${hasContext ? ' - reference their project documents' : ''}
2. For each method, a personalized explanation of how it applies to their needs${hasContext ? ' - cite specific information from their documents' : ''}
3. A suggested order to conduct these methods if they have time for multiple
4. One practical tip for getting started that references their project context

Keep the response concise and actionable. Use markdown formatting.`;

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const textContent = message.content.find((block) => block.type === 'text');
    const responseText = textContent && 'text' in textContent ? textContent.text : 'Unable to generate recommendation.';

    res.json({ recommendation: responseText });
  } catch (error) {
    console.error('Error generating recommendation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Failed to generate recommendation',
      details: errorMessage,
      recommendation: 'Unable to generate AI insights. Please try again later.',
    });
  }
});

export default router;
