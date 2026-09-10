import { Request, Response } from "express";

interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface AIRequestBody {
  message?: string;
  messages?: AIMessage[];
  code?: string;
  language?: string;
  fileName?: string;
  context?: string;
}

const AI_API_KEY = process.env.AI_API_KEY;
const AI_API_URL =
  process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
const AI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";

const SYSTEM_PROMPT = `
You are CodeBuddy AI, an expert programming assistant integrated into a collaborative cloud IDE.

Your responsibilities:
- Help users write, understand, debug, and improve code.
- Explain programming concepts clearly.
- Analyze code provided by the user.
- Identify syntax errors, logical errors, and potential runtime problems.
- Suggest efficient and maintainable solutions.
- Support multiple programming languages.
- Respect the user's existing project structure and requirements.
- Do not unnecessarily rewrite working code.
- When providing code, provide complete and directly usable code when appropriate.
- Do not claim that code was executed unless an execution result is explicitly provided.
- Do not invent files, APIs, errors, or execution results.

The user may provide:
- Source code
- Programming language
- File name
- Project context
- Error messages
- Questions about their project

Give concise but technically accurate responses.
`;

export const aiController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!AI_API_KEY) {
      res.status(500).json({
        success: false,
        message: "AI_API_KEY is not configured on the server",
      });
      return;
    }

    const {
      message,
      messages,
      code,
      language,
      fileName,
      context,
    }: AIRequestBody = req.body;

    if (
      (!message || typeof message !== "string") &&
      (!messages || !Array.isArray(messages) || messages.length === 0)
    ) {
      res.status(400).json({
        success: false,
        message: "A message or messages array is required",
      });
      return;
    }

    const conversation: AIMessage[] = [];

    if (messages && Array.isArray(messages)) {
      for (const item of messages) {
        if (
          item &&
          (item.role === "user" ||
            item.role === "assistant" ||
            item.role === "system") &&
          typeof item.content === "string"
        ) {
          conversation.push({
            role: item.role,
            content: item.content,
          });
        }
      }
    }

    if (message && typeof message === "string") {
      let userMessage = message;

      if (language) {
        userMessage += `\n\nProgramming Language: ${language}`;
      }

      if (fileName) {
        userMessage += `\nFile Name: ${fileName}`;
      }

      if (code) {
        userMessage += `\n\nCurrent Code:\n\`\`\`${language || ""}\n${code}\n\`\`\``;
      }

      if (context) {
        userMessage += `\n\nProject Context:\n${context}`;
      }

      conversation.push({
        role: "user",
        content: userMessage,
      });
    }

    const requestMessages: AIMessage[] = [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      ...conversation,
    ];

    const response = await fetch(AI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: requestMessages,
        temperature: 0.2,
      }),
    });

    const responseData: any = await response.json();

    if (!response.ok) {
      console.error("AI API Error:", responseData);

      res.status(response.status).json({
        success: false,
        message: "AI provider request failed",
        error:
          responseData?.error?.message ||
          responseData?.message ||
          "Unknown AI provider error",
      });

      return;
    }

    const assistantMessage =
      responseData?.choices?.[0]?.message?.content || "";

    if (!assistantMessage) {
      res.status(502).json({
        success: false,
        message: "AI provider returned an empty response",
      });

      return;
    }

    res.status(200).json({
      success: true,
      message: assistantMessage,
      model: AI_MODEL,
    });
  } catch (error) {
    console.error("❌ AI Controller Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to process AI request",
    });
  }
};