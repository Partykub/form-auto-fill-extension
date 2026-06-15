# Chrome Extension Auto Form Filler

Chrome Extension สำหรับช่วยจับคู่คำถามใน Google Forms และ Microsoft Forms กับข้อมูล Profile แล้วกรอกคำตอบอัตโนมัติ

## Project Structure

```text
.
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup.html
│   ├── popup.js
│   ├── options.html
│   └── options.js
└── backend/
    ├── src/
    │   ├── app.js
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

# form-auto-fill-extension
