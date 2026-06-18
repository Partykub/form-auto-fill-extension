# แผนการพัฒนา Phase 6: Manual Mapping (การจับคู่คำถามด้วยตนเอง)

เอกสารนี้คือแผนการทำงานสำหรับ **Phase 6: Manual Mapping** ของระบบ Chrome Extension Auto Form Filler โดยมีเป้าหมายเพื่อสร้างระบบให้ผู้ใช้สามารถเลือกจับคู่คำถามที่ระบบ (Phase 4) ให้ความมั่นใจต่ำ (Confidence < Threshold) เข้ากับข้อมูลใน Profile ได้ด้วยตนเอง และจดจำไว้ใช้ในครั้งต่อไป

## User Review Required

> [!IMPORTANT]
> - **ตำแหน่งของ Manual Mapping UI**: เนื่องจาก Popup มีพื้นที่จำกัด (กว้าง 320px) และอาจจะถูกปิดไปถ้าผู้ใช้คลิกพื้นที่อื่นบนหน้าจอ การนำคำถามที่หาคู่ไม่เจอมาให้ผู้ใช้เลือกจับคู่ใน Popup อาจจะใช้งานยาก แผนเบื้องต้นเสนอให้ทำ **UI แทรกเข้าไปในหน้า Popup (แบบ List ย่อๆ)** หรือ **เปิดหน้าต่างใหม่ (New Tab / Options Page)** อนุมัติให้ใช้แบบแทรกใน Popup ไปก่อนสำหรับ MVP เพื่อความรวดเร็วหรือไม่?
> - **ขอบเขตการจำ Mapping (Storage Level)**: การบันทึก Manual Mapping ควรบันทึกเป็นระดับ Global (คำถาม "ชื่อจริง" แปลว่า `full_name` ทุกฟอร์ม) หรือ ระดับ Form/Domain (จำเฉพาะฟอร์มนี้) แผนเบื้องต้นเสนอให้จำแบบ **Global Level** ก่อนเพื่อความง่ายต่อผู้ใช้

## Open Questions

> [!WARNING]
> 1. ในส่วนของหน้าจัดการ Mapping (TASK-019) เราจะไปสร้างแท็บ/ส่วนใหม่ใน `options.html` ที่มีอยู่แล้วใช่ไหมครับ?
> 2. ถ้าฟิลด์ที่ผู้ใช้เคย Map ไว้ถูกลบออกจาก Profile (เช่น ลบฟิลด์ `custom_phone` ทิ้ง) ต้องการให้ระบบลบ Mapping นั้นทิ้งอัตโนมัติเลย หรือเก็บไว้แต่แค่แสดงสถานะ Invalid ในหน้า Options ครับ?

## Proposed Changes

---

### 1. Extension: Manual Mapping Storage & Engine

#### [NEW] [mapping-store.js](file:///home/party/PartyKub/form-auto-fill-extension/extension/mapping-store.js)
- จัดการเซฟและโหลดข้อมูล Manual Mapping เข้า/ออกจาก `chrome.storage.local`
- โครงสร้างข้อมูล (Schema) เบื้องต้น: 
  ```json
  {
    "mappings": {
      "normalized_question_text_1": "profile_field_key_1",
      "normalized_question_text_2": "profile_field_key_2"
    }
  }
  ```
- มีฟังก์ชันเพิ่ม, แก้ไข, ลบ และดึง Mapping ทั้งหมด
- ซิงก์กับ `text-normalizer.js` (อาจจะต้องดึง logic normalize เข้ามาฝั่ง Extension หรือเรียกผ่าน Backend) เพื่อให้ Key มีความสม่ำเสมอ

---

### 2. Extension: Popup UI สำหรับจับคู่คำถาม

#### [MODIFY] [popup.html](file:///home/party/PartyKub/form-auto-fill-extension/extension/popup.html)
- เพิ่มซ่อน/แสดง `div#manual-mapping-section` สำหรับแสดงรายการคำถามที่ Unmatched (Confidence < Threshold)
- แสดง Dropdown ให้ผู้ใช้เลือก Profile Field ที่ตรงกับคำถามนั้นๆ
- มีปุ่ม "Save & Fill" เพื่อบันทึกค่าลง Storage และสั่งรัน Autofill ทันที
- มีปุ่ม "Skip" ข้ามการจับคู่ไปก่อน

#### [MODIFY] [popup.js](file:///home/party/PartyKub/form-auto-fill-extension/extension/popup.js)
- ปรับ logic หลังจากยิง `MATCH_QUESTIONS` ไปที่ Backend แล้ว ให้ตรวจสอบว่ามีคำถามไหนที่ Backend ส่งค่าสถานะว่า Unmatched หรือ `confidence` ไม่ถึงเกณฑ์
- ถ้ามี ให้สลับ UI ไปแสดง `manual-mapping-section` แทนการโชว์ผลสรุปปกติ
- หากผู้ใช้กด Save ให้ส่งข้อมูลไปอัปเดตที่ `mapping-store.js` และสั่ง `START_AUTOFILL` ไปที่ `content.js` อีกรอบเพื่อให้ Form Fill Engine ทำงาน

---

### 3. Extension: หน้าต่าง Options สำหรับจัดการ Mapping

#### [MODIFY] [options.html](file:///home/party/PartyKub/form-auto-fill-extension/extension/options.html)
- เพิ่มเมนู/แท็บ **"Saved Mappings"**
- แสดงตารางรายการคำถามที่เคยจับคู่ไว้ (`Question Text` -> `Mapped Field`)
- เพิ่มปุ่ม Delete สำหรับลบ Mapping ที่จับคู่ผิด

#### [MODIFY] [options.js](file:///home/party/PartyKub/form-auto-fill-extension/extension/options.js)
- เพิ่ม Logic ในการเรนเดอร์ข้อมูลจาก `mapping-store.js`
- ตรวจสอบความถูกต้องของ Mapping (เช่น ถ้า `Mapped Field` ไม่มีอยู่ใน Profile ปัจจุบัน ให้แสดงไฮไลต์สีแดงเตือนผู้ใช้)

---

### 4. Backend: เชื่อมต่อ Manual Mapping เข้ากับ Matching Logic
*(หากคุณได้สร้างไฟล์ของ Phase 4 สมบูรณ์แล้ว)*

#### [MODIFY] [backend/src/mapping.service.js](file:///home/party/PartyKub/form-auto-fill-extension/backend/src/mapping.service.js) หรือ [extension/content.js](file:///home/party/PartyKub/form-auto-fill-extension/extension/content.js)
- **ตัวเลือก A**: ให้ Backend เป็นตัวจัดการ Manual Mapping โดยที่ `content.js` ต้องส่ง `manualMappings` แนบไปใน Payload ของ `POST /api/v1/match` ด้วย
- **ตัวเลือก B**: ให้ Extension ทำงานก่อน (หากมีคำถามไหนอยู่ใน `mapping-store.js` ให้ข้ามการส่งไป Backend เลย) *[แนะนำวิธีนี้ ช่วยลดโหลด Backend]*

---

## Verification Plan

### Automated Tests
- ยูนิตเทสต์ (Unit Test) สำหรับ `mapping-store.js` ทดสอบการ Save/Load/Delete ผ่าน Mock ของ Chrome Storage

### Manual Verification
- **Test Unmatched Detection**: ลองสร้างฟอร์มที่มีคำถามกำกวม (เช่น "ข้อ 1", "คำตอบของคุณ") ซึ่ง Profile ไม่น่าจะรู้จัก 
- **Test Popup UI**: เมื่อกด Autofill จะต้องมีหน้าต่างเด้งให้เลือกแมป "ข้อ 1" เข้ากับ Profile Field 
- **Test Reusability**: หลังจากแมปและบันทึกแล้ว หากรีเฟรชหน้าแล้วกด Autofill ซ้ำ คำถาม "ข้อ 1" ต้องถูกกรอกโดยอัตโนมัติ ไม่ถามซ้ำอีก
- **Test Options Page**: เข้าสู่หน้า Options Page ตรวจสอบว่ามีรายการ Manual Mapping โผล่ขึ้นมา และกดลบได้
