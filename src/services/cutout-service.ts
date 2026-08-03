import type {
  CutoutCategory,
  CutoutRecord,
  CutoutSource,
  ImportedSubjectType
} from "../domain/cutout.js";
import { AppError } from "../errors.js";
import { buildCutoutPrompt } from "../prompts/cutout-prompt.js";
import {
  ensureTransparentPng,
  type TransparentPngResult
} from "./alpha-matte.js";
import { validateInputImage } from "./input-image.js";

interface CutoutGenerator {
  generateCutout(input: {
    image: Buffer;
    mimeType: string;
    prompt: string;
  }): Promise<Buffer>;
}

interface CutoutStoreContract {
  create(input: {
    image: Buffer;
    description: string;
    source: CutoutSource;
    usedFallback: boolean;
    transparencyRatio: number;
  }): Promise<CutoutRecord>;
  get(id: string): Promise<CutoutRecord | null>;
  getImage(id: string): Promise<Buffer | null>;
  update(
    id: string,
    input: { name: string; category: CutoutCategory }
  ): Promise<CutoutRecord | null>;
  delete(id: string): Promise<boolean>;
}

export interface CreateCutoutInput {
  image: Buffer;
  mimeType: string;
  description: string;
  subjectType: ImportedSubjectType;
  source: CutoutSource;
}

export interface CutoutServiceContract {
  create(input: CreateCutoutInput): Promise<CutoutRecord>;
  get(id: string): Promise<CutoutRecord | null>;
  getImage(id: string): Promise<Buffer | null>;
  update(
    id: string,
    input: { name: string; category: CutoutCategory }
  ): Promise<CutoutRecord | null>;
  delete(id: string): Promise<boolean>;
}

type TransparentPngProcessor = (
  input: Buffer
) => Promise<TransparentPngResult>;

type InputImageValidator = (
  image: Buffer,
  declaredMimeType: string
) => Promise<void>;

export class CutoutService implements CutoutServiceContract {
  constructor(
    private readonly generator: CutoutGenerator,
    private readonly store: CutoutStoreContract,
    private readonly makeTransparent: TransparentPngProcessor = ensureTransparentPng,
    private readonly validateImage: InputImageValidator = validateInputImage
  ) {}

  async create(input: CreateCutoutInput): Promise<CutoutRecord> {
    await this.validateImage(input.image, input.mimeType);
    const prompt = buildCutoutPrompt(input.description, input.subjectType);
    const generationStartedAt = performance.now();
    let generated: Buffer;
    try {
      generated = await this.generator.generateCutout({
        image: input.image,
        mimeType: input.mimeType,
        prompt
      });
    } catch (error) {
      console.info(
        "[ai-timing]",
        JSON.stringify({
          phase: "image-to-image",
          elapsedMs: Math.round(performance.now() - generationStartedAt),
          status: error instanceof AppError ? error.code : "error"
        })
      );
      throw error;
    }
    console.info(
      "[ai-timing]",
      JSON.stringify({
        phase: "image-to-image",
        elapsedMs: Math.round(performance.now() - generationStartedAt),
        outputBytes: generated.length
      })
    );
    let transparent: TransparentPngResult;

    try {
      const alphaStartedAt = performance.now();
      transparent = await this.makeTransparent(generated);
      console.info(
        "[ai-timing]",
        JSON.stringify({
          phase: "alpha-processing",
          elapsedMs: Math.round(performance.now() - alphaStartedAt),
          usedFallback: transparent.usedFallback,
          transparencyRatio: transparent.transparencyRatio
        })
      );
    } catch (error) {
      throw new AppError(
        422,
        "CUTOUT_ALPHA_FAILED",
        "AI 已生成图片，但没有得到可用的透明背景，请换一张主体更清晰的照片重试",
        { cause: error }
      );
    }

    return this.store.create({
      image: transparent.buffer,
      description: input.description.trim() || "参考图主体",
      source: input.source,
      usedFallback: transparent.usedFallback,
      transparencyRatio: transparent.transparencyRatio
    });
  }

  get(id: string): Promise<CutoutRecord | null> {
    return this.store.get(id);
  }

  getImage(id: string): Promise<Buffer | null> {
    return this.store.getImage(id);
  }

  update(
    id: string,
    input: { name: string; category: CutoutCategory }
  ): Promise<CutoutRecord | null> {
    return this.store.update(id, input);
  }

  delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}
