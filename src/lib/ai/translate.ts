import { generateText } from "ai";
import { getModel } from "./models";

export interface TranslationResult {
  translated: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export async function translateText(
  text: string,
  targetLang: "en" | "th",
  orgId?: string
): Promise<TranslationResult> {
  const sourceLang = targetLang === "en" ? "th" : "en";
  const model = await getModel("translation", orgId);

  const prompt =
    targetLang === "en"
      ? `Translate the following Thai text to English. Return ONLY the translation, no explanation.\n\n${text}`
      : `Translate the following English text to Thai. Return ONLY the translation, no explanation.\n\n${text}`;

  const result = await generateText({
    model,
    prompt,
  });

  return {
    translated: result.text.trim(),
    sourceLanguage: sourceLang,
    targetLanguage: targetLang,
  };
}

export async function translateVendorName(
  name: string,
  detectedLang: "en" | "th",
  orgId?: string
): Promise<{ nameEn: string; nameTh: string }> {
  if (detectedLang === "th") {
    const result = await translateText(name, "en", orgId);
    return { nameEn: result.translated, nameTh: name };
  } else {
    const result = await translateText(name, "th", orgId);
    return { nameEn: name, nameTh: result.translated };
  }
}
