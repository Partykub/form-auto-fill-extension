# Chrome Extension Auto Form Filler

Chrome Extension สำหรับช่วยจับคู่คำถามใน Google Forms และ Microsoft Forms กับข้อมูล Profile แล้วกรอกคำตอบอัตโนมัติ

## Project Structure

```text
.
├── extension/
│   ├── manifest.json
│   ├── adapters/
│   │   ├── core.js
│   │   ├── google-forms.js
│   │   ├── microsoft-forms.js
│   │   └── registry.js
│   ├── background.js
│   ├── content.js
│   ├── profile.js
│   ├── profile-sync.js
│   ├── popup.html
│   ├── popup.js
│   ├── options.html
│   └── options.js
└── backend/
    ├── src/
    │   ├── app.js
    │   ├── profile.service.js
    │   └── server.js
    ├── .env.example
    └── package.json
```

## Backend Setup

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Backend จะทำงานที่ `http://localhost:3000` โดยตรวจสอบได้ที่:

```bash
curl http://localhost:3000/health
```

MVP นี้ไม่ใช้ AI model, OpenAI API หรือ local ML model สำหรับการจับคู่คำถาม จึงไม่มีค่าใช้จ่ายจาก model

## Profile Management

เปิด Options Page จาก Popup เพื่อจัดการ Profile:

- Default fields: `full_name`, `phone`, `email`, `province`
- เพิ่ม custom field ด้วย key รูปแบบ lowercase snake_case เช่น `company_name`
- Aliases คั่นด้วย comma และต้องไม่ซ้ำกัน
- Profile ถูกบันทึกใน Chrome Storage ก่อน แล้ว sync ไป Backend
- ถ้า Backend ปิดอยู่ ข้อมูลจะอยู่ในสถานะ Pending sync และลองใหม่ได้ภายหลัง
- ถ้า local และ server ถูกแก้ไขแยกกัน ระบบจะแสดง Conflict ให้เลือก Use Local หรือ Use Server

Backend จัดเก็บ Profile ไว้ที่ `backend/data/profile.json` ซึ่งถูก ignore จาก Git

### Profile API

```text
GET /api/profile
PUT /api/profile
```

ตัวอย่าง request สำหรับบันทึก:

```json
{
  "profile": {
    "schemaVersion": 1,
    "profileId": "default",
    "revision": 0,
    "updatedAt": "2026-06-15T00:00:00.000Z",
    "fields": [
      {
        "key": "full_name",
        "label": "ชื่อ-นามสกุล",
        "aliases": ["ชื่อผู้สมัคร"],
        "value": "John Doe",
        "isDefault": true
      },
      {
        "key": "phone",
        "label": "เบอร์โทรศัพท์",
        "aliases": ["เบอร์ติดต่อ"],
        "value": "0812345678",
        "isDefault": true
      },
      {
        "key": "email",
        "label": "อีเมล",
        "aliases": ["ที่อยู่อีเมล"],
        "value": "john@example.com",
        "isDefault": true
      },
      {
        "key": "province",
        "label": "จังหวัด",
        "aliases": ["จังหวัดที่อาศัยอยู่"],
        "value": "Bangkok",
        "isDefault": true
      }
    ]
  },
  "expectedRevision": 0
}
```

`PUT` ใช้ optimistic revision และตอบ `409 PROFILE_CONFLICT` เมื่อ server revision เปลี่ยนไปแล้ว

## Question Extraction

Content Script เลือก adapter จาก URL และ DOM signature แล้วอ่านคำถามเฉพาะ section/page ที่กำลังแสดงอยู่

Phase 3 verification:

- Automated tests: `29/29` pass
- Manual Google Forms: `Extracted 8 questions (0 unsupported)`
- Manual Microsoft Forms: `Extracted 9 questions (0 unsupported)`
- Phase นี้ยังไม่กรอกหรือ submit form จริง

ชนิดคำถามใน MVP:

- `short_text`
- `long_text`
- `email`
- `phone`
- `radio`
- `checkbox`
- `dropdown`
- `unsupported`

ผล extraction ใช้ normalized shape:

```json
{
  "id": "google:name",
  "platform": "google",
  "text": "ชื่อ-นามสกุล",
  "description": "",
  "type": "short_text",
  "rawType": "text",
  "required": true,
  "supported": true,
  "options": []
}
```

Content Script messages:

- `GET_PAGE_STATUS` ตรวจว่า URL และ DOM เป็น form ที่รองรับหรือไม่
- `EXTRACT_QUESTIONS` คืน `{ platform, questions, unsupportedCount, warnings }`
- `RUN_AUTOFILL` ยังทำ extraction และคืน summary เท่านั้นใน Phase 3

Adapter รอ form render สูงสุด 8 วินาที และล้าง extraction cache หลัง DOM เปลี่ยนแบบ debounce 150ms ส่วน `fillAnswer` และ `submit` จะตอบ `FEATURE_NOT_IMPLEMENTED` จนกว่าจะทำ Phase Autofill

## Question Mapping

Phase ถัดไปจะจับคู่คำถามด้วย Question Mapping Engine แบบ deterministic:

- Manual mapping memory
- Exact label, alias, pattern และ key match
- Type hint rules เช่น `email` และ `phone`
- Keyword rules
- Token overlap
- Character n-gram similarity สำหรับภาษาไทยและคำสั้น

ระบบจะ auto match เฉพาะเมื่อ confidence สูงพอ หากคะแนนต่ำหรือกำกวมจะส่งให้ manual mapping แทน

### Manual Extraction Check

หลัง Load unpacked หรือ Reload Extension:

1. เปิด Google Form และ Microsoft Form ที่มีชนิดคำถามตาม MVP
2. เปิด Extension popup แล้วกด Autofill
3. ตรวจ summary ใน popup
4. เรียก `EXTRACT_QUESTIONS` จาก Extension debugging console เมื่อต้องการดู payload เต็ม
5. เปลี่ยน section แล้วรันอีกครั้งเพื่อยืนยันว่าอ่านเฉพาะหน้าปัจจุบัน

## Load Extension

1. เปิด `chrome://extensions`
2. เปิด Developer mode
3. เลือก Load unpacked
4. เลือกโฟลเดอร์ `extension/`
5. เปิด Google Forms หรือ Microsoft Forms แล้วกดไอคอน Extension

## Development Commands

รัน Backend:

```bash
cd backend
npm start
```

รัน Backend พร้อม reload เมื่อไฟล์เปลี่ยน:

```bash
cd backend
npm run dev
```

ตรวจ syntax และรัน tests:

```bash
cd backend
npm run check
npm test
```

# form-auto-fill-extension
