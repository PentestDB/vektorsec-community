import { ToolDefinition } from "../types";
import { invoke_llm } from "../../utils/llm/providers";

const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  tiff: "image/tiff",
  tif: "image/tiff",
  svg: "image/svg+xml",
};

const viewImage: ToolDefinition = {
  name: "view_image",
  description:
    "View an image file on the attack box using AI vision. Returns a text description and any visible text/flags. " +
    "Use this to read text, flags, QR codes, or understand visual content in images (PNG, JPEG, GIF, BMP, WEBP, TIFF).",
  parameters: {
    type: "object",
    properties: {
      image_path: {
        type: "string",
        description:
          "Path to the image file on the attack box (absolute or relative to ~/pentest-workspace)",
      },
      question: {
        type: "string",
        description:
          "Optional: what to look for in the image. Defaults to describing the image and extracting any visible text.",
      },
    },
    required: ["image_path"],
  },
  timeoutMs: 120_000,

  async execute(args, ctx) {
    const { image_path, question } = args;
    if (!image_path) {
      return { output: "Error: image_path is required", exitCode: 1 };
    }

    const rawPath =
      image_path.startsWith("/") || image_path.startsWith("~")
        ? image_path
        : image_path;

    // Replace leading ~ with $HOME so shell expansion works inside double quotes
    const resolvedPath = rawPath.replace(/^~(?=\/|$)/, "$HOME");

    const { output: sizeOut, exitCode: sizeExit } = await ctx.runCommand(
      `stat -c %s "${resolvedPath}" 2>/dev/null || stat -f %z "${resolvedPath}" 2>/dev/null`,
      10_000,
    );

    if (sizeExit !== 0 || !sizeOut.trim()) {
      return {
        output: `Error: File not found or not accessible: ${resolvedPath}`,
        exitCode: 1,
      };
    }

    const fileSize = parseInt(sizeOut.trim(), 10);
    if (isNaN(fileSize)) {
      return { output: `Error: Could not determine file size`, exitCode: 1 };
    }
    if (fileSize > MAX_IMAGE_SIZE_BYTES) {
      return {
        output:
          `Error: Image is too large (${(fileSize / 1024 / 1024).toFixed(1)} MB, max ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024} MB). ` +
          `Resize or crop it first using Pillow or ffmpeg, then try again.`,
        exitCode: 1,
      };
    }
    if (fileSize === 0) {
      return { output: "Error: File is empty (0 bytes)", exitCode: 1 };
    }

    const ext = resolvedPath.split(".").pop()?.toLowerCase() ?? "";
    let mimeType = MIME_MAP[ext];

    if (!mimeType) {
      const { output: fileOut } = await ctx.runCommand(
        `file --mime-type -b "${resolvedPath}"`,
        10_000,
      );
      const detected = fileOut.trim();
      if (detected.startsWith("image/")) {
        mimeType = detected;
      } else {
        return {
          output: `Error: Not a recognized image format (detected: ${detected}). Convert to PNG/JPEG first.`,
          exitCode: 1,
        };
      }
    }

    const { output: b64Out, exitCode: b64Exit } = await ctx.runCommand(
      `base64 -w 0 "${resolvedPath}" 2>/dev/null || base64 -i "${resolvedPath}" 2>/dev/null`,
      30_000,
    );

    if (b64Exit !== 0 || !b64Out.trim()) {
      return {
        output: `Error: Failed to read image file: ${resolvedPath}`,
        exitCode: 1,
      };
    }

    const base64Data = b64Out.trim();
    const dataUri = `data:${mimeType};base64,${base64Data}`;

    const userPrompt =
      question ||
      "Describe this image in detail. Extract and reproduce ALL visible text exactly as written, including any flags, codes, or hidden messages.";

    try {
      const result = await invoke_llm({
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: dataUri, detail: "high" },
              },
              { type: "text", text: userPrompt },
            ],
          },
        ],
        temperature: 0.2,
        sessionId: ctx.sessionId,
        tags: ["tool", "vision", "view-image"],
        generationName: "view_image",
      });

      if (!result.content) {
        return {
          output: "Error: Vision model returned no response",
          exitCode: 1,
        };
      }

      return { output: result.content, exitCode: 0 };
    } catch (err: any) {
      return {
        output: `Error calling vision model: ${err.message ?? err}`,
        exitCode: 1,
      };
    }
  },
};

export default viewImage;
