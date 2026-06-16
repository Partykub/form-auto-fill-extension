# TASK - Chrome Extension Auto Form Filler

เอกสารนี้แตกงานจาก `PRD.md` สำหรับพัฒนา MVP ของ Chrome Extension ที่รองรับ Google Forms และ Microsoft Forms

## Definition of Done

- [ ] Extension ติดตั้งผ่าน Chrome Developer Mode ได้
- [ ] ผู้ใช้สร้างและแก้ไข Profile ได้
- [ ] Extension ตรวจจับและอ่านคำถามจาก Google Forms และ Microsoft Forms ได้
- [ ] ระบบจับคู่คำถามกับ Profile ด้วย manual mapping หรือ embedding similarity ได้
- [ ] ระบบกรอกคำตอบในฟอร์มได้ถูกต้อง
- [ ] ผู้ใช้เลือกเปิดหรือปิด auto submit ได้
- [ ] Scheduler และ hotkey ทำงานได้
- [ ] API key ไม่ถูกเก็บหรือเปิดเผยในฝั่ง Extension
- [ ] มี README สำหรับติดตั้ง ตั้งค่า และใช้งานระบบ
- [ ] Test cases หลักของ MVP ผ่านทั้งหมด

---

## Phase 1: Project Setup

### TASK-001: สร้างโครงสร้างโปรเจกต์

- [x] สร้างโฟลเดอร์ `extension/`
- [x] สร้างโฟลเดอร์ `backend/src/`
- [x] สร้าง `README.md`
- [x] สร้าง `.gitignore`
- [x] สร้าง `.env.example` สำหรับ Backend

**Acceptance Criteria**

- โครงสร้างไฟล์สอดคล้องกับ Architecture ใน PRD
- ไม่มี secret หรือ `.env` ถูก commit

### TASK-002: ตั้งค่า Chrome Extension Manifest V3

- [x] สร้าง `extension/manifest.json`
- [x] กำหนด permissions สำหรับ `storage`, `alarms`, `tabs` และ `scripting`
- [x] กำหนด host permissions สำหรับ Google Forms, Microsoft Forms และ Backend
- [x] ลงทะเบียน background service worker
- [x] ลงทะเบียน content script
- [x] กำหนด popup และ options page
- [x] กำหนด keyboard commands

**Acceptance Criteria**

- โหลด Extension แบบ unpacked ใน Chrome ได้โดยไม่มี manifest error
- Popup, options page, background service worker และ content script ถูกเรียกใช้งานได้

### TASK-003: ตั้งค่า Backend

- [x] สร้าง Node.js project
- [x] ติดตั้งและตั้งค่า Express
- [x] เพิ่ม middleware สำหรับ JSON, CORS และ error handling
- [x] เพิ่ม endpoint `GET /health`
- [x] อ่านค่า `OPENAI_API_KEY` จาก environment variable
- [x] เพิ่มคำสั่ง run และ development ใน `package.json`

**Acceptance Criteria**

- Backend เริ่มทำงานได้ด้วยคำสั่งที่ระบุใน README
- `GET /health` ตอบสถานะสำเร็จ
- Backend แจ้ง error ที่เข้าใจได้เมื่อไม่มี environment variable ที่จำเป็น

---

## Phase 2: Profile Management

### TASK-004: กำหนด Profile schema

- [x] รองรับ field เริ่มต้น `full_name`, `phone`, `email` และ `province`
- [x] รองรับ label หรือ alias หลายภาษาในแต่ละ field
- [x] เพิ่ม validation สำหรับชื่อ field และ value
- [x] ออกแบบ schema ให้เพิ่ม custom field ได้
- [x] กำหนดรูปแบบ JSON สำหรับจัดเก็บ Profile

**Acceptance Criteria**

- Profile ถูก validate ก่อนบันทึก
- ผู้ใช้เพิ่ม custom field โดยไม่ต้องแก้ source code ได้

### TASK-005: สร้าง Options Page สำหรับจัดการ Profile

- [x] สร้างฟอร์มเพิ่มและแก้ไขข้อมูล Profile
- [x] แสดงรายการ fields ปัจจุบัน
- [x] รองรับการเพิ่มและลบ custom field
- [x] บันทึก Profile ด้วย Chrome Storage API
- [x] แสดงสถานะบันทึกสำเร็จหรือ validation error

**Acceptance Criteria**

- ปิดและเปิด options page ใหม่แล้วข้อมูลยังอยู่
- ข้อมูลที่ไม่ถูกต้องไม่ถูกบันทึก

### TASK-006: สร้าง Backend Profile Service

- [x] สร้าง `profile.service.js`
- [x] จัดเก็บ Profile ใน JSON file สำหรับ MVP
- [x] เพิ่ม API สำหรับอ่านและบันทึก Profile
- [x] ป้องกัน malformed JSON และ file access error
- [x] แยก storage implementation เพื่อรองรับ SQLite ในอนาคต

**Acceptance Criteria**

- Backend อ่านและอัปเดต Profile ได้
- API ไม่ส่งข้อมูลลับหรือ stack trace กลับไปยัง client

---

## Phase 3: Question Extraction

> Implementation และ automated DOM fixture tests เสร็จแล้ว (`28/28` tests ผ่าน) แต่ยังรอ manual verification บน Google Forms และ Microsoft Forms จริงผ่าน Chrome ก่อนปิด Phase 3

### TASK-007: สร้าง Form Adapter interface

- [ ] กำหนด interface กลางสำหรับตรวจจับฟอร์ม อ่านคำถาม กรอกคำตอบ และ submit
- [ ] กำหนด normalized question model เช่น `id`, `text`, `type`, `required` และ element reference
- [ ] เลือก adapter จาก hostname หรือ DOM ของหน้า
- [ ] รองรับ error เมื่อหน้าไม่ใช่ฟอร์มที่รู้จัก

**Acceptance Criteria**

- Google Forms และ Microsoft Forms ใช้ flow กลางเดียวกันได้
- Logic เฉพาะ platform แยกจาก matching และ profile logic

### TASK-008: รองรับ Google Forms

- [ ] ตรวจจับหน้า Google Form
- [ ] อ่านข้อความคำถาม
- [ ] ตรวจจับชนิด input ที่รองรับ
- [ ] เชื่อมคำถามกับ element ที่ต้องกรอก
- [ ] รองรับหน้า form ที่ render แบบ dynamic

**Acceptance Criteria**

- อ่านคำถามจาก Google Form ตัวอย่างได้ครบตามชนิด input ที่กำหนดใน MVP
- ไม่อ่าน title, description หรือข้อความประกอบเป็นคำถามโดยผิดพลาด

### TASK-009: รองรับ Microsoft Forms

- [ ] ตรวจจับหน้า Microsoft Form
- [ ] อ่านข้อความคำถาม
- [ ] ตรวจจับชนิด input ที่รองรับ
- [ ] เชื่อมคำถามกับ element ที่ต้องกรอก
- [ ] รองรับหน้า form ที่ render แบบ dynamic

**Acceptance Criteria**

- อ่านคำถามจาก Microsoft Form ตัวอย่างได้ครบตามชนิด input ที่กำหนดใน MVP
- ไม่อ่าน title, description หรือข้อความประกอบเป็นคำถามโดยผิดพลาด

### TASK-010: กำหนดชนิดคำตอบใน MVP

- [ ] รองรับ short text
- [ ] รองรับ long text
- [ ] รองรับ email และ phone input
- [ ] รองรับ radio button
- [ ] รองรับ checkbox
- [ ] รองรับ dropdown
- [ ] ระบุ unsupported field โดยไม่ทำให้ autofill ทั้งหน้าล้มเหลว

**Acceptance Criteria**

- แต่ละ input type มี fixture หรือ sample form สำหรับทดสอบ
- Unsupported field ถูกข้ามและแสดงในผลลัพธ์

---

## Phase 4: Embedding and Matching

### TASK-011: สร้าง Embedding Service

- [ ] สร้าง `embedding.service.js`
- [ ] เชื่อมต่อ OpenAI Embedding API
- [ ] ใช้ model `text-embedding-3-small`
- [ ] เพิ่ม timeout, retry และ error handling
- [ ] normalize ข้อความก่อนสร้าง embedding
- [ ] cache profile label embeddings เพื่อ reuse

**Acceptance Criteria**

- สร้าง embedding จากข้อความได้
- Profile label เดิมไม่เรียก API ซ้ำโดยไม่จำเป็น
- API key อยู่เฉพาะใน Backend

### TASK-012: สร้าง Similarity Service

- [ ] สร้าง `similarity.service.js`
- [ ] implement cosine similarity
- [ ] เปรียบเทียบ question embedding กับ profile embeddings
- [ ] เลือก field ที่มีคะแนนสูงสุด
- [ ] ใช้ threshold เริ่มต้น `0.75`
- [ ] รองรับการตั้งค่า threshold

**Acceptance Criteria**

- Response มี `field`, `value` และ `confidence`
- คะแนนต่ำกว่า threshold ถูกระบุว่าต้อง manual mapping
- มี unit tests สำหรับ cosine similarity และ threshold boundary

### TASK-013: สร้าง Matching API

- [ ] เพิ่ม endpoint สำหรับรับรายการคำถาม
- [ ] validate request payload
- [ ] โหลด Profile และ cached embeddings
- [ ] match คำถามแบบ batch
- [ ] คืนผลลัพธ์ตาม question ID
- [ ] จำกัดขนาด request และจัดการ rate limit

**Acceptance Criteria**

- Extension ส่งหลายคำถามใน request เดียวได้
- Error ของคำถามหนึ่งข้อไม่ทำให้ผลลัพธ์ทุกข้อหาย

### TASK-014: เพิ่มลำดับความสำคัญของการ Match

- [ ] ตรวจ manual mapping ก่อน
- [ ] ตรวจ exact normalized label หรือ alias
- [ ] ใช้ embedding similarity เป็น fallback
- [ ] ไม่กรอกคำตอบเมื่อไม่มี match ที่มั่นใจ

**Acceptance Criteria**

- ลำดับคือ manual mapping > exact/alias > embedding
- ผลลัพธ์ระบุ match source เพื่อ debug ได้

---

## Phase 5: Autofill

### TASK-015: เชื่อม Content Script กับ Matching API

- [ ] Extract คำถามจาก adapter
- [ ] ส่งคำถามไป Backend
- [ ] รับและ map ผลลัพธ์กลับไปยัง DOM element
- [ ] แสดง loading, success และ error state
- [ ] ป้องกันการยิง request ซ้ำระหว่าง autofill รอบเดียวกัน

**Acceptance Criteria**

- ผู้ใช้สั่ง autofill แล้ว flow ทำงานตั้งแต่ extract ถึงได้รับคำตอบ
- Backend ล่มแล้วหน้า form ยังใช้งานด้วยตนเองได้

### TASK-016: สร้าง Form Fill Engine

- [ ] กรอก text, email, phone และ textarea
- [ ] เลือก radio, checkbox และ dropdown
- [ ] dispatch input/change events ให้ framework ของหน้าเว็บรับรู้
- [ ] ไม่เขียนทับค่าที่ผู้ใช้กรอกไว้ เว้นแต่ผู้ใช้ยืนยัน
- [ ] สรุปจำนวน field ที่กรอก สำเร็จ ข้าม และล้มเหลว

**Acceptance Criteria**

- ค่าที่กรอกแสดงใน UI และถูก form state รับรู้
- การรันซ้ำให้ผลลัพธ์สม่ำเสมอ

### TASK-017: สร้าง Popup UI

- [ ] แสดงสถานะว่าเป็น form ที่รองรับหรือไม่
- [ ] เพิ่มปุ่ม Autofill
- [ ] เพิ่มตัวเลือก Auto Submit
- [ ] แสดงผลลัพธ์การกรอก
- [ ] เพิ่มทางลัดไป Options Page
- [ ] แสดง Backend connection status

**Acceptance Criteria**

- ผู้ใช้เริ่ม autofill และดูผลลัพธ์จาก popup ได้
- ปุ่มถูก disable เมื่อหน้าเว็บไม่รองรับ

---

## Phase 6: Manual Mapping

### TASK-018: สร้าง Manual Mapping UI

- [ ] แสดงคำถามที่ confidence ต่ำกว่า threshold
- [ ] แสดง Profile fields ที่เลือกได้
- [ ] รองรับการเลือกข้ามคำถาม
- [ ] บันทึก mapping เมื่อผู้ใช้ยืนยัน
- [ ] ใช้ mapping ที่เลือกเพื่อกรอกฟอร์มรอบปัจจุบัน

**Acceptance Criteria**

- ผู้ใช้แก้ unmatched question ได้โดยไม่ต้องแก้ Profile
- UI แสดง question, selected field และ value preview ชัดเจน

### TASK-019: จัดเก็บและนำ Manual Mapping กลับมาใช้

- [ ] normalize question text ก่อนใช้เป็น mapping key
- [ ] จัดเก็บ mapping ด้วย Chrome Storage API
- [ ] แยก mapping ตาม form/platform เมื่อจำเป็น
- [ ] เพิ่มหน้าดู แก้ไข และลบ mappings
- [ ] ตรวจ field ที่ถูกลบออกจาก Profile

**Acceptance Criteria**

- คำถามเดิมใช้ mapping เดิมได้แม้ URL ของฟอร์มเปลี่ยน
- Mapping ที่อ้างถึง field ที่ไม่มีแล้วไม่ทำให้ extension error

---

## Phase 7: Automation

### TASK-020: เพิ่ม Auto Submit

- [ ] เพิ่ม setting เปิดหรือปิด auto submit โดยค่าเริ่มต้นเป็นปิด
- [ ] ตรวจว่าทุก required field ที่รองรับถูกกรอกแล้ว
- [ ] แสดง confirmation หรือ countdown ก่อน submit
- [ ] เรียก submit ผ่าน platform adapter
- [ ] ป้องกัน submit ซ้ำ

**Acceptance Criteria**

- ระบบไม่ submit เมื่อ required field ยังว่างหรือมี field ที่กรอกล้มเหลว
- ผู้ใช้ยกเลิกระหว่าง countdown ได้

### TASK-021: เพิ่ม Hotkey Support

- [ ] กำหนด command สำหรับเริ่ม autofill
- [ ] ส่ง message จาก background service worker ไป content script
- [ ] แสดง feedback เมื่อ hotkey ถูกเรียก
- [ ] ระบุวิธีเปลี่ยน hotkey ใน README

**Acceptance Criteria**

- Hotkey เริ่ม autofill บน active supported form ได้
- Hotkey ไม่ทำให้เกิด error บน tab ที่ไม่รองรับ

### TASK-022: เพิ่ม Scheduler

- [ ] สร้าง UI กำหนด URL, วันเวลา และ auto submit
- [ ] บันทึก schedules ด้วย Chrome Storage API
- [ ] ใช้ Chrome Alarms API เรียกงานตามเวลา
- [ ] เปิดหรือ focus form tab เมื่อถึงเวลา
- [ ] รอให้หน้าโหลดก่อนเริ่ม autofill
- [ ] บันทึกสถานะ last run และ error
- [ ] รองรับแก้ไข ปิดใช้งาน และลบ schedule

**Acceptance Criteria**

- Schedule ทำงานหลัง service worker ถูก suspend และปลุกกลับมา
- เวลาแสดงและทำงานตาม timezone ของผู้ใช้
- งานที่ล้มเหลวไม่ถูก submit และมีสถานะให้ตรวจสอบ

---

## Phase 8: Security and Reliability

### TASK-023: เพิ่ม Security Controls

- [ ] จำกัด CORS เฉพาะ Extension origin ที่ตั้งค่าไว้
- [ ] validate และ sanitize input ทุก API
- [ ] ไม่ log Profile values หรือ API key
- [ ] เพิ่ม request size limit
- [ ] ตรวจ permissions ใน manifest ให้เท่าที่จำเป็น
- [ ] เพิ่มแนวทางเก็บข้อมูลส่วนบุคคลใน README

**Acceptance Criteria**

- OpenAI API key ไม่ปรากฏใน extension bundle หรือ network request จาก content script
- Log ไม่มีข้อมูล Profile แบบ plaintext

### TASK-024: เพิ่ม Logging และ Error Handling

- [ ] กำหนด error codes ระหว่าง popup, content script, background และ backend
- [ ] เพิ่ม structured logs ใน Backend
- [ ] แสดง error ที่ผู้ใช้แก้ไขได้ใน UI
- [ ] เพิ่ม debug mode ที่ไม่เปิดเผยข้อมูลส่วนบุคคล
- [ ] รองรับ network timeout และ retry ที่เหมาะสม

**Acceptance Criteria**

- ผู้ใช้แยกได้ว่า error มาจาก unsupported form, network, backend หรือ matching
- ระบบไม่ค้างใน loading state หลังเกิด error

---

## Phase 9: Testing and Release

### TASK-025: เพิ่ม Backend Tests

- [ ] Unit test Profile Service
- [ ] Unit test Embedding Service ด้วย mocked API
- [ ] Unit test cosine similarity
- [ ] Unit test matching priority และ threshold
- [ ] Integration test Matching API
- [ ] Test invalid payload และ error cases

**Acceptance Criteria**

- Test suite รันได้ด้วยคำสั่งเดียว
- Critical matching paths มี test coverage

### TASK-026: เพิ่ม Extension Tests

- [ ] Unit test text normalization
- [ ] Unit test manual mapping lookup
- [ ] Test message flow ระหว่าง extension components
- [ ] Test form adapters ด้วย DOM fixtures
- [ ] Test fill engine สำหรับ input types ที่รองรับ

**Acceptance Criteria**

- Google Forms และ Microsoft Forms fixtures ผ่าน
- มี regression test สำหรับ selector หรือ DOM parsing สำคัญ

### TASK-027: ทำ End-to-End Test

- [ ] ทดสอบสร้าง Profile
- [ ] ทดสอบ exact match
- [ ] ทดสอบ embedding match
- [ ] ทดสอบ manual mapping และ reuse
- [ ] ทดสอบ autofill ทุก input type
- [ ] ทดสอบ hotkey
- [ ] ทดสอบ scheduler
- [ ] ทดสอบ auto submit ทั้ง success และ blocked case
- [ ] ทดสอบ Backend offline และ OpenAI API error

**Acceptance Criteria**

- User flow หลักผ่านบน Chrome เวอร์ชันที่ระบุใน README
- ไม่มี silent failure ใน flow หลัก

### TASK-028: จัดทำ Documentation และ Release Package

- [ ] เขียนขั้นตอนติดตั้ง Backend
- [ ] เขียนขั้นตอนตั้งค่า `.env`
- [ ] เขียนขั้นตอนโหลด Extension แบบ unpacked
- [ ] เขียนคู่มือสร้าง Profile และ manual mapping
- [ ] เขียนคู่มือ scheduler, hotkey และ auto submit
- [ ] ระบุข้อจำกัดและ input types ที่ยังไม่รองรับ
- [ ] เพิ่ม troubleshooting
- [ ] สร้าง release checklist

**Acceptance Criteria**

- ผู้ใช้ใหม่ติดตั้งและทดลอง autofill ได้จาก README เพียงอย่างเดียว
- Release package ไม่มี `.env`, test data ส่วนบุคคล หรือไฟล์ที่ไม่จำเป็น

---

## Recommended MVP Order

1. `TASK-001` ถึง `TASK-003`: Project foundation
2. `TASK-004` ถึง `TASK-006`: Profile management
3. `TASK-007`, `TASK-008`, `TASK-010`: Google Forms adapter
4. `TASK-011` ถึง `TASK-014`: Matching system
5. `TASK-015` ถึง `TASK-017`: Autofill flow
6. `TASK-018` ถึง `TASK-019`: Manual mapping
7. `TASK-009`: Microsoft Forms adapter
8. `TASK-020` ถึง `TASK-022`: Automation
9. `TASK-023` ถึง `TASK-028`: Hardening, tests, and release

## MVP Scope Notes

- Auto submit ต้องเป็น opt-in และปิดเป็นค่าเริ่มต้น
- ควรส่งคำถามไป Backend แบบ batch เพื่อลดจำนวน OpenAI API calls
- Manual mapping ควรทำงานได้แม้ Backend หรือ OpenAI API ใช้งานไม่ได้
- Scheduler ของ Chrome Extension ไม่รับประกันความแม่นยำระดับวินาที
- DOM ของ Google Forms และ Microsoft Forms เปลี่ยนได้ จึงควรแยก adapter และมี DOM fixture tests
