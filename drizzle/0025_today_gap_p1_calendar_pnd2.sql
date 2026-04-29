ALTER TYPE "public"."wht_form_type" ADD VALUE IF NOT EXISTS 'pnd2';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "thai_business_calendar" (
  "date" date PRIMARY KEY NOT NULL,
  "holiday_name_th" text NOT NULL,
  "holiday_name_en" text NOT NULL,
  "source_announcement" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "thai_business_calendar_date"
  ON "thai_business_calendar" ("date");
--> statement-breakpoint
INSERT INTO "thai_business_calendar"
  ("date", "holiday_name_th", "holiday_name_en", "source_announcement")
VALUES
  ('2026-01-01', 'วันขึ้นปีใหม่', 'New Year''s Day', 'Bank of Thailand financial institutions holidays 2026'),
  ('2026-01-02', 'วันหยุดพิเศษเพิ่มเติม', 'Additional special holiday', 'Bank of Thailand financial institutions holidays 2026'),
  ('2026-03-03', 'วันมาฆบูชา', 'Makha Bucha Day', 'Bank of Thailand financial institutions holidays 2026'),
  ('2026-04-06', 'วันจักรี', 'Chakri Memorial Day', 'Bank of Thailand financial institutions holidays 2026'),
  ('2026-04-13', 'วันสงกรานต์', 'Songkran Festival', 'Bank of Thailand financial institutions holidays 2026'),
  ('2026-04-14', 'วันสงกรานต์', 'Songkran Festival', 'Bank of Thailand financial institutions holidays 2026'),
  ('2026-04-15', 'วันสงกรานต์', 'Songkran Festival', 'Bank of Thailand financial institutions holidays 2026'),
  ('2026-05-01', 'วันแรงงานแห่งชาติ', 'National Labour Day', 'Bank of Thailand financial institutions holidays 2026'),
  ('2026-05-04', 'วันฉัตรมงคล', 'Coronation Day', 'Bank of Thailand financial institutions holidays 2026'),
  ('2026-06-01', 'ชดเชยวันวิสาขบูชา', 'Substitution for Visakha Bucha Day', 'Bank of Thailand financial institutions holidays 2026'),
  ('2026-06-03', 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี', 'H.M. Queen Suthida Bajrasudhabimalalakshana''s Birthday', 'Bank of Thailand financial institutions holidays 2026'),
  ('2026-07-28', 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว', 'H.M. King Maha Vajiralongkorn Phra Vajiraklaochaoyuhua''s Birthday', 'Bank of Thailand financial institutions holidays 2026'),
  ('2026-07-29', 'วันอาสาฬหบูชา', 'Asarnha Bucha Day', 'Bank of Thailand financial institutions holidays 2026'),
  ('2026-08-12', 'วันแม่แห่งชาติ', 'H.M. Queen Sirikit The Queen Mother''s Birthday / Mother''s Day', 'Bank of Thailand financial institutions holidays 2026'),
  ('2026-10-13', 'วันนวมินทรมหาราช', 'H.M. King Bhumibol Adulyadej The Great Memorial Day', 'Bank of Thailand financial institutions holidays 2026'),
  ('2026-10-23', 'วันปิยมหาราช', 'H.M. King Chulalongkorn the Great Memorial Day', 'Bank of Thailand financial institutions holidays 2026'),
  ('2026-12-07', 'ชดเชยวันคล้ายวันพระบรมราชสมภพ รัชกาลที่ 9 วันชาติ และวันพ่อแห่งชาติ', 'Substitution for H.M. King Bhumibol Adulyadej the Great''s Birthday, National Day and Father''s Day', 'Bank of Thailand financial institutions holidays 2026'),
  ('2026-12-10', 'วันรัฐธรรมนูญ', 'Constitution Day', 'Bank of Thailand financial institutions holidays 2026'),
  ('2026-12-31', 'วันสิ้นปี', 'New Year''s Eve', 'Bank of Thailand financial institutions holidays 2026')
ON CONFLICT ("date") DO UPDATE SET
  "holiday_name_th" = EXCLUDED."holiday_name_th",
  "holiday_name_en" = EXCLUDED."holiday_name_en",
  "source_announcement" = EXCLUDED."source_announcement";
