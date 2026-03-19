import { z } from "zod/v4";

export const idCardExtractionSchema = z.object({
  nameTh: z.string().describe("Full name in Thai from the ID card"),
  nameEn: z
    .string()
    .optional()
    .describe("Full name in English if present on the card"),
  citizenId: z.string().describe("13-digit Thai citizen ID number"),
  dateOfBirth: z
    .string()
    .optional()
    .describe("Date of birth in YYYY-MM-DD format"),
  address: z
    .string()
    .optional()
    .describe("Address from the ID card in Thai"),
  expiryDate: z
    .string()
    .optional()
    .describe("Card expiry date in YYYY-MM-DD format"),
  confidence: z.number().min(0).max(1).describe("Extraction confidence 0-1"),
});

export type IdCardExtraction = z.infer<typeof idCardExtractionSchema>;
