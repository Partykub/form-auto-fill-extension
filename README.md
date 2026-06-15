# Chrome Extension Auto Form Filler

Chrome Extension สำหรับช่วยจับคู่คำถามใน Google Forms และ Microsoft Forms กับข้อมูล Profile แล้วกรอกคำตอบอัตโนมัติ

## Project Structure

```text
.
├── extension/
│   ├── manifest.json
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

`OPENAI_API_KEY` ยังไม่จำเป็นสำหรับ health endpoint แต่ต้องตั้งค่าก่อนใช้งาน embedding API ใน phase ถัดไป

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
