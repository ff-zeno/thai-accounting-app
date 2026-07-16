--
-- PostgreSQL database dump
--


-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: cit_brackets; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.cit_brackets (id, effective_from, effective_to, entity_type, lower_bound, upper_bound, marginal_rate, source_citation, created_at, updated_at) VALUES ('794fd139-b99f-4567-ad63-f98936774e35', '2026-05-16', NULL, 'standard', 0.00, NULL, 0.2000, 'Revenue Department corporate income tax overview, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-07-15 17:39:27.038434+00', NULL);
INSERT INTO public.cit_brackets (id, effective_from, effective_to, entity_type, lower_bound, upper_bound, marginal_rate, source_citation, created_at, updated_at) VALUES ('3f454c0b-cc08-4821-8901-557f4e3c0fb0', '2026-05-16', NULL, 'sme_qualifying', 0.00, 300000.00, 0.0000, 'Revenue Department corporate income tax overview, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-07-15 17:39:27.038434+00', NULL);
INSERT INTO public.cit_brackets (id, effective_from, effective_to, entity_type, lower_bound, upper_bound, marginal_rate, source_citation, created_at, updated_at) VALUES ('918410f8-2e28-4dd7-b459-992529ce55cb', '2026-05-16', NULL, 'sme_qualifying', 300000.00, 3000000.00, 0.1500, 'Revenue Department corporate income tax overview, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-07-15 17:39:27.038434+00', NULL);
INSERT INTO public.cit_brackets (id, effective_from, effective_to, entity_type, lower_bound, upper_bound, marginal_rate, source_citation, created_at, updated_at) VALUES ('b8c9d459-7ad2-4c76-888e-de3c6ffb858d', '2026-05-16', NULL, 'sme_qualifying', 3000000.00, NULL, 0.2000, 'Revenue Department corporate income tax overview, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-07-15 17:39:27.038434+00', NULL);


--
-- Data for Name: tax_min_life_by_category; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.tax_min_life_by_category (category, tax_useful_life_months_minimum, source_citation, effective_from, created_at, updated_at) VALUES ('building', 240, 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-05-16', '2026-07-15 17:39:25.423411+00', NULL);
INSERT INTO public.tax_min_life_by_category (category, tax_useful_life_months_minimum, source_citation, effective_from, created_at, updated_at) VALUES ('equipment', 60, 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-05-16', '2026-07-15 17:39:25.423411+00', NULL);
INSERT INTO public.tax_min_life_by_category (category, tax_useful_life_months_minimum, source_citation, effective_from, created_at, updated_at) VALUES ('vehicle', 60, 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-05-16', '2026-07-15 17:39:25.423411+00', NULL);
INSERT INTO public.tax_min_life_by_category (category, tax_useful_life_months_minimum, source_citation, effective_from, created_at, updated_at) VALUES ('furniture_fixtures', 60, 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-05-16', '2026-07-15 17:39:25.423411+00', NULL);
INSERT INTO public.tax_min_life_by_category (category, tax_useful_life_months_minimum, source_citation, effective_from, created_at, updated_at) VALUES ('intangible_other', 120, 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-05-16', '2026-07-15 17:39:25.423411+00', NULL);
INSERT INTO public.tax_min_life_by_category (category, tax_useful_life_months_minimum, source_citation, effective_from, created_at, updated_at) VALUES ('land', 0, 'Land is not depreciable; tracked as register-only for book/tax workflow, retrieved 2026-05-16', '2026-05-16', '2026-07-15 17:39:25.423411+00', NULL);
INSERT INTO public.tax_min_life_by_category (category, tax_useful_life_months_minimum, source_citation, effective_from, created_at, updated_at) VALUES ('temporary_building', 12, 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-05-16', '2026-07-15 17:39:25.423411+00', '2026-07-15 17:39:25.966242+00');
INSERT INTO public.tax_min_life_by_category (category, tax_useful_life_months_minimum, source_citation, effective_from, created_at, updated_at) VALUES ('computer_hardware', 36, 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-05-16', '2026-07-15 17:39:25.423411+00', '2026-07-15 17:39:25.966242+00');
INSERT INTO public.tax_min_life_by_category (category, tax_useful_life_months_minimum, source_citation, effective_from, created_at, updated_at) VALUES ('computer_software', 36, 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-05-16', '2026-07-15 17:39:25.423411+00', '2026-07-15 17:39:25.966242+00');
INSERT INTO public.tax_min_life_by_category (category, tax_useful_life_months_minimum, source_citation, effective_from, created_at, updated_at) VALUES ('leasehold_improvement', 120, 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-05-16', '2026-07-15 17:39:25.423411+00', '2026-07-15 17:39:25.966242+00');
INSERT INTO public.tax_min_life_by_category (category, tax_useful_life_months_minimum, source_citation, effective_from, created_at, updated_at) VALUES ('natural_resource_right', 240, 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16', '2026-05-16', '2026-07-15 17:39:25.423411+00', '2026-07-15 17:39:25.966242+00');


--
-- Data for Name: thai_business_calendar; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.thai_business_calendar (date, holiday_name_th, holiday_name_en, source_announcement, created_at) VALUES ('2026-01-01', 'วันขึ้นปีใหม่', 'New Year''s Day', 'Bank of Thailand financial institutions holidays 2026', '2026-07-15 17:39:17.82126+00');
INSERT INTO public.thai_business_calendar (date, holiday_name_th, holiday_name_en, source_announcement, created_at) VALUES ('2026-01-02', 'วันหยุดพิเศษเพิ่มเติม', 'Additional special holiday', 'Bank of Thailand financial institutions holidays 2026', '2026-07-15 17:39:17.82126+00');
INSERT INTO public.thai_business_calendar (date, holiday_name_th, holiday_name_en, source_announcement, created_at) VALUES ('2026-03-03', 'วันมาฆบูชา', 'Makha Bucha Day', 'Bank of Thailand financial institutions holidays 2026', '2026-07-15 17:39:17.82126+00');
INSERT INTO public.thai_business_calendar (date, holiday_name_th, holiday_name_en, source_announcement, created_at) VALUES ('2026-04-06', 'วันจักรี', 'Chakri Memorial Day', 'Bank of Thailand financial institutions holidays 2026', '2026-07-15 17:39:17.82126+00');
INSERT INTO public.thai_business_calendar (date, holiday_name_th, holiday_name_en, source_announcement, created_at) VALUES ('2026-04-13', 'วันสงกรานต์', 'Songkran Festival', 'Bank of Thailand financial institutions holidays 2026', '2026-07-15 17:39:17.82126+00');
INSERT INTO public.thai_business_calendar (date, holiday_name_th, holiday_name_en, source_announcement, created_at) VALUES ('2026-04-14', 'วันสงกรานต์', 'Songkran Festival', 'Bank of Thailand financial institutions holidays 2026', '2026-07-15 17:39:17.82126+00');
INSERT INTO public.thai_business_calendar (date, holiday_name_th, holiday_name_en, source_announcement, created_at) VALUES ('2026-04-15', 'วันสงกรานต์', 'Songkran Festival', 'Bank of Thailand financial institutions holidays 2026', '2026-07-15 17:39:17.82126+00');
INSERT INTO public.thai_business_calendar (date, holiday_name_th, holiday_name_en, source_announcement, created_at) VALUES ('2026-05-01', 'วันแรงงานแห่งชาติ', 'National Labour Day', 'Bank of Thailand financial institutions holidays 2026', '2026-07-15 17:39:17.82126+00');
INSERT INTO public.thai_business_calendar (date, holiday_name_th, holiday_name_en, source_announcement, created_at) VALUES ('2026-05-04', 'วันฉัตรมงคล', 'Coronation Day', 'Bank of Thailand financial institutions holidays 2026', '2026-07-15 17:39:17.82126+00');
INSERT INTO public.thai_business_calendar (date, holiday_name_th, holiday_name_en, source_announcement, created_at) VALUES ('2026-06-01', 'ชดเชยวันวิสาขบูชา', 'Substitution for Visakha Bucha Day', 'Bank of Thailand financial institutions holidays 2026', '2026-07-15 17:39:17.82126+00');
INSERT INTO public.thai_business_calendar (date, holiday_name_th, holiday_name_en, source_announcement, created_at) VALUES ('2026-06-03', 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี', 'H.M. Queen Suthida Bajrasudhabimalalakshana''s Birthday', 'Bank of Thailand financial institutions holidays 2026', '2026-07-15 17:39:17.82126+00');
INSERT INTO public.thai_business_calendar (date, holiday_name_th, holiday_name_en, source_announcement, created_at) VALUES ('2026-07-28', 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว', 'H.M. King Maha Vajiralongkorn Phra Vajiraklaochaoyuhua''s Birthday', 'Bank of Thailand financial institutions holidays 2026', '2026-07-15 17:39:17.82126+00');
INSERT INTO public.thai_business_calendar (date, holiday_name_th, holiday_name_en, source_announcement, created_at) VALUES ('2026-07-29', 'วันอาสาฬหบูชา', 'Asarnha Bucha Day', 'Bank of Thailand financial institutions holidays 2026', '2026-07-15 17:39:17.82126+00');
INSERT INTO public.thai_business_calendar (date, holiday_name_th, holiday_name_en, source_announcement, created_at) VALUES ('2026-08-12', 'วันแม่แห่งชาติ', 'H.M. Queen Sirikit The Queen Mother''s Birthday / Mother''s Day', 'Bank of Thailand financial institutions holidays 2026', '2026-07-15 17:39:17.82126+00');
INSERT INTO public.thai_business_calendar (date, holiday_name_th, holiday_name_en, source_announcement, created_at) VALUES ('2026-10-13', 'วันนวมินทรมหาราช', 'H.M. King Bhumibol Adulyadej The Great Memorial Day', 'Bank of Thailand financial institutions holidays 2026', '2026-07-15 17:39:17.82126+00');
INSERT INTO public.thai_business_calendar (date, holiday_name_th, holiday_name_en, source_announcement, created_at) VALUES ('2026-10-23', 'วันปิยมหาราช', 'H.M. King Chulalongkorn the Great Memorial Day', 'Bank of Thailand financial institutions holidays 2026', '2026-07-15 17:39:17.82126+00');
INSERT INTO public.thai_business_calendar (date, holiday_name_th, holiday_name_en, source_announcement, created_at) VALUES ('2026-12-07', 'ชดเชยวันคล้ายวันพระบรมราชสมภพ รัชกาลที่ 9 วันชาติ และวันพ่อแห่งชาติ', 'Substitution for H.M. King Bhumibol Adulyadej the Great''s Birthday, National Day and Father''s Day', 'Bank of Thailand financial institutions holidays 2026', '2026-07-15 17:39:17.82126+00');
INSERT INTO public.thai_business_calendar (date, holiday_name_th, holiday_name_en, source_announcement, created_at) VALUES ('2026-12-10', 'วันรัฐธรรมนูญ', 'Constitution Day', 'Bank of Thailand financial institutions holidays 2026', '2026-07-15 17:39:17.82126+00');
INSERT INTO public.thai_business_calendar (date, holiday_name_th, holiday_name_en, source_announcement, created_at) VALUES ('2026-12-31', 'วันสิ้นปี', 'New Year''s Eve', 'Bank of Thailand financial institutions holidays 2026', '2026-07-15 17:39:17.82126+00');


--
-- PostgreSQL database dump complete
--


