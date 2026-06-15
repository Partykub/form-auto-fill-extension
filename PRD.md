# Chrome Extension - Auto Form Filler

## Overview

Chrome Extension สำหรับกรอก Google Form และ Microsoft Form อัตโนมัติ

### Features

- Profile Management
- Auto Form Detection
- Embedding-Based Question Matching
- Auto Fill Answers
- Auto Submit
- Scheduler
- Hotkey Support
- Manual Mapping Fallback

---

# Goals

สร้างระบบที่สามารถ:

1. เปิดฟอร์มอัตโนมัติ
2. อ่านคำถามจากฟอร์ม
3. Match คำถามกับข้อมูลใน Profile
4. กรอกข้อมูลอัตโนมัติ
5. Submit อัตโนมัติ
6. รองรับฟอร์มที่เปลี่ยนลิงก์บ่อย

---

# Tech Stack

## Frontend

- Chrome Extension Manifest V3
- Vanilla JavaScript
- Chrome Storage API

## Backend

- Node.js
- Express

## AI

- OpenAI Embedding API
- Model: text-embedding-3-small

## Storage

MVP

- JSON File

Future

- SQLite

---

# Architecture

```txt
Chrome Extension
│
├── Popup UI
├── Options Page
├── Background Service Worker
└── Content Script

Backend
│
├── Embedding Service
├── Similarity Service
└── Profile Service
```

---

# Folder Structure

```txt
project/
│
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup.html
│   ├── popup.js
│   ├── options.html
│   └── options.js
│
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── embedding.service.js
│   │   ├── similarity.service.js
│   │   └── profile.service.js
│   │
│   └── .env
│
└── README.md
```

---

# User Profile

Example

```json
{
  "full_name": "John Doe",
  "phone": "0812345678",
  "email": "john@example.com",
  "province": "Bangkok"
}
```

---

# Embedding Strategy

Generate embeddings for profile labels.

Example:

```json
[
  {
    "field": "full_name",
    "label": "ชื่อ-นามสกุล"
  },
  {
    "field": "phone",
    "label": "เบอร์โทรศัพท์"
  },
  {
    "field": "email",
    "label": "อีเมล"
  }
]
```

Store embeddings for reuse.

---

# Autofill Flow

## Step 1

User opens form.

Example:

```txt
https://docs.google.com/forms/...
```

---

## Step 2

Content Script extracts questions.

Example:

```json
["ชื่อ-นามสกุล", "เบอร์โทรศัพท์", "อีเมล"]
```

---

## Step 3

Send questions to backend.

---

## Step 4

Backend performs similarity search.

Example:

Question:

```txt
กรุณาระบุเบอร์ติดต่อกลับ
```

Result:

```json
{
  "field": "phone",
  "value": "0812345678",
  "confidence": 0.92
}
```

---

## Step 5

Extension fills answer.

---

# Similarity Matching

Algorithm

1. Generate embedding for question
2. Compare against profile embeddings
3. Cosine similarity
4. Select highest score

Threshold

```txt
0.75
```

---

# Manual Mapping

If confidence is below threshold

Show UI

```txt
Question:
ชื่อผู้สมัคร

Available Fields:

- full_name
- phone
- email
```

User selects field.

Store mapping.

Example

```json
{
  "ชื่อผู้สมัคร": "full_name"
}
```

Reuse in future.

---

# Auto Submit

Configuration

```json
{
  "autoSubmit": true
}
```

Flow

1. Validate required fields
2. Fill answers
3. Click Submit

---

# Scheduler

User Configuration

```json
{
  "url": "https://docs.google.com/forms/xxxxx",
  "runAt": "2026-06-20T23:59:59"
}
```

Flow

1. Create Chrome Alarm
2. Open URL
3. Run Autofill
4. Submit Form

---

# Hotkey Mode

Configuration

```json
{
  "1": "Option A",
  "2": "Option B",
  "3": "Option C"
}
```

Flow

User presses:

```txt
1
```

System selects:

```txt
Option A
```

---

# Google Form Support

Must Support

- Short Answer
- Paragraph
- Radio Button
- Checkbox
- Dropdown
- Date
- Time
- Multiple Choice Grid

---

# Microsoft Form Support

Must Support

- Text
- Choice
- Multiple Choice
- Dropdown
- Rating

---

# Storage

Chrome Storage

```json
{
  "profiles": [],
  "mappings": [],
  "settings": {}
}
```

---

# MVP Scope

Phase 1

- Google Form
- Profile Management
- Embedding Matching
- Auto Fill
- Auto Submit

Phase 2

- Scheduler
- Hotkeys
- Manual Mapping

Phase 3

- Microsoft Form
- Multiple Profiles
- Export / Import Profiles

---

# Deliverables

- Chrome Extension
- Backend API
- Embedding Matching
- Google Form Autofill
- Auto Submit
- Documentation

---

# Success Criteria

- User creates profile
- User opens form
- System maps questions automatically
- System fills answers automatically
- System submits successfully
- Works across different Google Forms without hardcoded selectors
