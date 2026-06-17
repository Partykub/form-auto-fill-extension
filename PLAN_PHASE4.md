# แผนการพัฒนา Phase 4: Question Mapping Engine

เอกสารนี้คือแผนการทำงานสำหรับ **Phase 4: Question Mapping Engine** ของระบบ Chrome Extension Auto Form Filler โดยมีเป้าหมายหลักในการสร้างระบบจับคู่คำถามจากฟอร์มเข้ากับข้อมูลใน Profile อย่างแม่นยำ โดยไม่พึ่งพา AI Model หรือ External API

> [!NOTE]
> ระบบนี้เน้นการทำงานด้วย Rule-based Similarity Matching, Text Normalization, และ Pattern Bank เป็นหลัก

## User Review Required

> [!IMPORTANT]
> - **การจัดการข้อมูลภาษาไทย**: การตัดคำ (Tokenization) สำหรับ N-gram similarity และ Token overlap ในภาษาไทยเบื้องต้นจะใช้วิธีการแบ่งตาม Character N-gram หรือ Word Tokenizer แบบง่าย (เช่นแยกตามช่องว่างและเครื่องหมาย) หากผู้ใช้มี Library ตัดคำภาษาไทยที่ต้องการใช้เป็นพิเศษ (เช่น `wordcut`, `thai-tokenizer`) โปรดแจ้งให้ทราบ หรือถ้าให้เริ่มจากระบบเบื้องต้นก่อน ก็สามารถอนุมัติได้เลย
> - **ตำแหน่งไฟล์ Manual Mapping**: สำหรับลำดับความสำคัญ (TASK-014) ระบบจำเป็นต้องพึ่งพา Manual Mapping (ซึ่งอยู่ Phase 6) ใน Phase 4 นี้จะออกแบบโครงสร้างเผื่อรองรับ Manual Mapping ไว้ (Mock data หรือรับค่าเข้ามาจาก Request) ผู้ใช้อนุมัติแนวทางนี้หรือไม่?

## Open Questions

> [!WARNING]
> 1. ใน Endpoint ของ Matching API (`POST /api/v1/match`) จำเป็นต้องรับค่า "Form URL" หรือ "Form ID" เข้ามาด้วยหรือไม่ เพื่อใช้เป็น Context สำหรับดึง Manual Mapping ที่บันทึกแยกตามฟอร์มในอนาคต?
> 2. ต้องการให้กำหนด Default Threshold สำหรับการ Match ที่ 0.72 เป็น Global Constant ใน Environment (`.env`) แทนที่จะ Hardcode ไว้ในโค้ดหรือไม่?

## Proposed Changes

---

### Backend Service - Similarity & Mapping Engine

ส่วนประกอบหลักสำหรับประมวลผลความเหมือนของข้อความ และการหาฟิลด์ที่ตรงกับคำถามมากที่สุด

#### [NEW] [text-normalizer.js](file:///home/party/PartyKub/form-auto-fill-extension/backend/src/text-normalizer.js)
- สร้างฟังก์ชันสำหรับจัดการ String (Normalize)
- ลบ Whitespace ที่ซ้ำซ้อน
- ลบ Punctuation (เช่น `*`, `-`, `_`, `()`)
- ลบตัวเลขและเครื่องหมายที่สื่อถึงลำดับข้อ (เช่น `1.`, `2)`)
- ลบคำฟุ่มเฟือย เช่น "กรุณาระบุ", "โปรดกรอก", "please enter", "required"
- จัดการให้ข้อความเป็นตัวพิมพ์เล็ก (Lower-case)

#### [NEW] [pattern-bank.js](file:///home/party/PartyKub/form-auto-fill-extension/backend/src/pattern-bank.js)
- จัดเก็บและจัดการ Default pattern สำหรับฟิลด์หลัก (`full_name`, `phone`, `email`, `province`)
- ดึงข้อมูล `label`, `aliases` และ `key` จาก Profile มาผนวกรวมเป็น Pattern ชุดใหญ่

#### [NEW] [similarity.service.js](file:///home/party/PartyKub/form-auto-fill-extension/backend/src/similarity.service.js)
- 구현 Service (Implement) สำหรับการคำนวณคะแนนความเหมือน:
  1. Exact Match Scoring: เช็คค่าเป๊ะๆ กับ Pattern
  2. Token Overlap Scoring: ตัดคำและนับสัดส่วนของคำที่ตรงกัน
  3. Character N-gram Similarity: ตรวจจับคำที่มีการสะกดผิดเล็กน้อย หรือคำภาษาไทยติดกัน
  4. Type Hint Scoring: ให้คะแนนพิเศษถ้า Element Type ตรงกับ Field (เช่น `type="email"` บวกคะแนนให้ฟิลด์ `email`)
- ฟังก์ชันคำนวณและหา Score สูงสุด พร้อมประเมินด้วย Threshold (`>= 0.72`) และ Ambiguous margin (`0.08`)

#### [NEW] [mapping.service.js](file:///home/party/PartyKub/form-auto-fill-extension/backend/src/mapping.service.js)
- เป็น Service หลักที่รวมศูนย์ (Orchestrator) สำหรับจับคู่คำถาม
- ทำตามลำดับความสำคัญของการ Match:
  1. Manual Mapping (ผ่าน Mock/Context)
  2. Exact match (ผ่าน Similarity Service)
  3. Rule-based Fallback (ผ่าน Similarity Service)

---

### Backend Service - API Layer

#### [MODIFY] [app.js](file:///home/party/PartyKub/form-auto-fill-extension/backend/src/app.js)
- เพิ่ม Endpoint ใหม่: `POST /api/v1/match`
- จำกัดขนาด Payload (Limit request size)
- เพิ่ม Middleware สำหรับ Rate Limiting กันการโจมตีหรือ Request รัวๆ จาก Extension

#### [NEW] [mapping.controller.js](file:///home/party/PartyKub/form-auto-fill-extension/backend/src/mapping.controller.js) (Optional / Or inline in router)
- รับ Request เป็น Array ของคำถาม (Batch Processing)
- Validate Request Payload Format (เช่น ต้องมี `id`, `text`, `type` เป็นต้น)
- เรียกใช้ `mapping.service.js` และโหลด Profile ปัจจุบันจาก `profile.service.js` มาเพื่อเป็นฐานข้อมูลในการเปรียบเทียบ
- คืนค่า Response ตามกำหนด (`field`, `value`, `confidence`, `match_source`)

---

## Verification Plan

เพื่อยืนยันว่า Question Mapping Engine ทำงานได้อย่างถูกต้องและตรงตามข้อกำหนดของ MVP

### Automated Tests
- `npm test` เพื่อรัน Unit Tests ของ Text Normalizer: ทดสอบคำฟุ่มเฟือย, สัญลักษณ์, เลขลำดับข้อ ว่าถูกล้างออกได้อย่างถูกต้อง
- `npm test` เพื่อรัน Unit Tests ของ Similarity Service: 
  - ทดสอบ Exact Match กับ Pattern Bank
  - ทดสอบ Token Overlap
  - ทดสอบ Character N-gram
  - ทดสอบ Threshold (Boundary < 0.72 และ > 0.72) และ Ambiguous margin
- ทดสอบ Integration API `POST /api/v1/match` ด้วย Payload หลายรูปแบบ (แบบส่งมาหลายคำถามพร้อมกัน, แบบฟิลด์ที่ส่งมามั่ว ฯลฯ)

### Manual Verification
- สตาร์ท Backend
- ลองจำลองยิง `POST /api/v1/match` ผ่าน cURL หรือ Postman
- ใส่คำถามจำลองที่มีทั้งคำไทยวิบัติ (เช่น "เบอร์โทร์ศัพท") หรือมีคำฟุ่มเฟือยติดมา ("กรุณาระบุที่อยู่อีเมลของคุณ") และดูผลการแมทช์กับ Profile ที่เรามี ว่าสามารถชี้เป้า Field ได้ถูกต้อง พร้อมคืนค่า Value ให้หรือไม่
