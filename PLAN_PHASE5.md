# แผนการพัฒนา Phase 5: Autofill (การกรอกข้อมูลอัตโนมัติ)

## Open Questions — ต้องการคำตอบ

### Q1: การจัดการค่านอกที่ผู้ใช้กรอกไว้แล้ว
> **Recommendation: Skip + สรุปผลตอนท้าย (MVP)**

**เหตุผล:**
- การทำ "ยืนยันการเขียนทับ" จะเพิ่ม UI complexity มาก (confirm dialog ใน popup)
- MVP เน้น flow พื้นฐานให้ทำงานได้ก่อน
- ถ้าต้องการ overwrite ภายหลังทำเป็น setting toggle ใน Phase 7

**Decision:** Skip fields ที่มีค่าอยู่แล้ว + แสดงสรุป (Filled/Skipped/Failed) ใน popup

---

### Q2: Auto Submit Toggle
> **Recommendation: เก็บ Setting ไว้ก่อน (MVP)**

**เหตุผล:**
- TASK-020 (Auto Submit จริง) อยู่ใน Phase 7
- แต่ TASK-017 ระบุว่าต้องมี toggle ใน popup
- ทำ toggle ที่เก็บค่าใน chrome.storage ได้เลย — logic จริงทำใน Phase 7

**Decision:** เพิ่ม toggle ใน popup + เก็บค่าใน storage, logic จริงทำ Phase 7

---

### Q3: Popup UI — Vanilla CSS หรือ Framework
> **Recommendation: Vanilla CSS (ตามโค้ดเดิม)**

**เหตุผล:**
- โค้ดเดิมใช้ Vanilla CSS ทั้งหมด
- Popup มีขนาดเล็ก (~320px) ไม่จำเป็นต้องใช้ framework
- เพิ่มความเร็วในการโหลด

**Decision:** ใช้ Vanilla CSS ตามรูปแบบเดิม

---

## Proposed Changes

### 1. Extension: Background Service Worker (Proxy API)

**File: `extension/background.js`**

เพิ่มหน้าที่เป็น proxy ระหว่าง content script และ backend API เพื่อแก้ปัญหา CORS:

```
Content Script → chrome.runtime.sendMessage → Background → fetch(Backend API) → Response → Content Script
```

**Changes:**
- เพิ่ม message handler สำหรับ `MATCH_QUESTIONS`
- เรียก `fetch` ไปยัง backend URL ที่เก็บใน chrome.storage
- ส่ง response กลับไป content script
- จัดการ error (network timeout, backend unavailable)

---

### 2. Extension: Content Script — Autofill Flow

**File: `extension/content.js`**

เพิ่ม message handler ใหม่และ autofill orchestration:

**Message Types ใหม่:**
- `START_AUTOFILL` — เริ่มกระบวนการ autofill ทั้งหมด
- `AUTOFILL_PROGRESS` — ส่งสถานะกลับ popup (loading, filling, done)
- `AUTOFILL_RESULT` — ส่งสรุปผล (filled, skipped, failed)

**Flow:**
```
1. รับ message START_AUTOFILL
2. extractQuestions() จาก adapter ที่มีอยู่แล้ว
3. กรองเฉพาะ supported questions
4. ส่งคำถามทั้งหมดไป Background (MATCH_QUESTIONS)
5. รับ matches กลับมา
6. เรียก fillEngine.fillAll(matches)
7. ส่งสรุปผลกลับ popup
```

---

### 3. Extension: Form Fill Engine (NEW)

**File: `extension/fill-engine.js` (ใหม่)**

แยก logic การกรอกจาก content script เพื่อความสะอาด:

**API:**
```js
fillEngine.fillAll(matches) → { filled: number, skipped: number, failed: number, details: [] }
```

**Logic:**
- **Text/Email/Phone/Textarea:**
  - หา element จาก adapter bindings
  - ตรวจสอบว่ามีค่าอยู่แล้วหรือไม่ → ถ้ามีให้ skip
  - ตั้งค่า `.value = match.value`
  - Dispatch events: `input`, `change`, `blur` (เพื่อให้ React/Vue รับรู้)

- **Radio:**
  - หา option ที่ตรงกับ match.value
  - ตั้ง `checked = true`
  - Dispatch `click`, `change`

- **Checkbox:**
  - หา option ที่ตรงกับ match.value
  - ตั้ง `checked = true`
  - Dispatch `click`, `change`

- **Dropdown (Select):**
  - หา option ที่ตรงกับ match.value
  - ตั้ง `selectedIndex`
  - Dispatch `change`

**Key Design Decisions:**
- ใช้ adapter bindings (ที่สร้างใน Phase 3) เพื่อหา DOM element
- ตรวจสอบ `element.value` ก่อนกรอก — ถ้าไม่ว่างให้ skip
- ใช้ `Object.getOwnPropertyDescriptor` เพื่อ set value ใน reactive frameworks
- dispatch events ทุกครั้งหลังตั้งค่า

---

### 4. Extension: Popup UI — เพิ่ม Autofill Controls

**File: `extension/popup.html`**

เพิ่ม UI elements ใหม่:

```html
<!-- เพิ่ม Loading Spinner -->
<div id="loading" hidden>
  <span class="spinner"></span>
  <span>กำลังกรอกข้อมูล...</span>
</div>

<!-- เพิ่ม Result Summary -->
<div id="result" hidden>
  <p>สำเร็จ: <span id="filled-count">0</span></p>
  <p>ข้าม: <span id="skipped-count">0</span></p>
  <p>ล้มเหลว: <span id="failed-count">0</span></p>
</div>

<!-- เพิ่ม Auto Submit Toggle -->
<label>
  <input type="checkbox" id="auto-submit-toggle">
  Auto Submit (experimental)
</label>

<!-- เพิ่ม Backend Status -->
<span id="backend-status" class="badge" data-status="checking">Backend...</span>
```

**CSS เพิ่ม:**
- Spinner animation
- Result summary styling
- Backend status badge (green/yellow/red)
- Toggle switch styling

---

**File: `extension/popup.js`**

เพิ่ม logic ใหม่:

```js
// 1. เช็คว่า Backend ใช้งานได้ไหม
async function checkBackendHealth() {
  const backendUrl = await getBackendUrl();
  try {
    const resp = await fetch(`${backendUrl}/health`);
    updateBackendStatus(resp.ok ? 'online' : 'offline');
  } catch {
    updateBackendStatus('offline');
  }
}

// 2. Autofill button handler — เรียก flow ใหม่
autofillButton.addEventListener("click", async () => {
  // แสดง loading
  // ส่ง message START_AUTOFILL ไป content.js
  // รอ result แล้วแสดง summary
});

// 3. Auto Submit toggle — เก็บค่าใน storage
autoSubmitToggle.addEventListener("change", () => {
  chrome.storage.local.set({ autoSubmit: autoSubmitToggle.checked });
});

// 4. Load autoSubmit setting เมื่อ popup เปิด
```

---

### 5. Extension: Options Page — เพิ่ม Backend URL Setting

**File: `extension/options.js`**

เพิ่มการอ่าน backend URL สำหรับ content script:

```js
// Content script ต้องรู้ backend URL เพื่อส่ง request
// เก็บใน chrome.storage.local { backendUrl: "http://localhost:3000" }
// options.js เก็บค่านี้แล้ว content script อ่านใช้
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Popup UI                              │
│  [Check Backend] [Autofill Now] [Auto Submit Toggle]        │
└──────────────────────┬──────────────────────────────────────┘
                       │ chrome.tabs.sendMessage
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     Content Script                           │
│                                                              │
│  1. extractQuestions()  →  [questions]                      │
│  2. chrome.runtime.sendMessage(MATCH_QUESTIONS)             │
│  3. receive matches from Background                          │
│  4. fillEngine.fillAll(matches)                              │
│  5. send result back to Popup                               │
└──────────────────────┬──────────────────────────────────────┘
                       │ chrome.runtime.sendMessage
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Background Service Worker                 │
│                                                              │
│  1. Receive MATCH_QUESTIONS                                  │
│  2. Read backendUrl from storage                             │
│  3. fetch(backendUrl + '/api/v1/match', { questions })      │
│  4. Return response to Content Script                       │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     Backend API                               │
│                                                              │
│  POST /api/v1/match                                          │
│  → Load Profile from JSON                                    │
│  → Match questions (pattern bank + similarity)               │
│  → Return { matches: [{ id, field, value, confidence }] }   │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Order (Tasks)

### TASK-015: เชื่อม Content Script กับ Matching API
1. เพิ่ม `MATCH_QUESTIONS` handler ใน `background.js` (proxy fetch)
2. เพิ่ม `START_AUTOFILL` handler ใน `content.js`
3. Flow: extract → send to bg → receive matches → return to popup
4. เพิ่ม error handling (backend offline, network timeout, invalid response)
5. ป้องกัน double-request (isRunning flag)

### TASK-016: สร้าง Form Fill Engine
1. สร้าง `fill-engine.js` — class `FillEngine`
2. Implement filling สำหรับ: text, email, phone, textarea
3. Implement filling สำหรับ: radio, checkbox, dropdown
4. ใช้ adapter bindings เพื่อหา DOM element
5. Skip fields ที่ผู้ใช้กรอกไว้แล้ว
6. Dispatch events (input, change, blur, click)
7. ส่งสรุปผลกลับ popup

### TASK-017: สร้าง Popup UI
1. เพิ่ม loading spinner ใน popup.html
2. เพิ่ม result summary (filled/skipped/failed)
3. เพิ่ม auto submit toggle + storage
4. เพิ่ม backend status badge
5. อัปเดต popup.js — autofill flow + health check
6. เพิ่ม CSS สำหรับ UI ใหม่

---

## Testing Strategy

### Unit Tests (Jest + JSDOM)

**fill-engine.test.js:**
- `fillText()` — ตั้งค่า + dispatch events ถูกต้อง
- `fillRadio()` — เลือก option ที่ตรง
- `fillCheckbox()` — เลือก option ที่ตรง
- `fillDropdown()` — set selectedIndex + change event
- `skipExisting()` — ไม่เขียนทับค่าเดิม
- `skipUnsupported()` — ข้าม unsupported types

**content-script.test.js:**
- `START_AUTOFILL` flow — extract → match → fill → result
- Error handling — backend offline
- Double-request prevention

### Integration Tests

**autofill-integration.test.js:**
- Mock background proxy → return fake matches
- Mock adapter → return fake questions
- Verify full flow: extract → match → fill → summary

### Manual E2E Tests

1. **Google Forms:**
   - ตั้ง profile (name, email, phone, province)
   - เปิด Google Form
   - กด Autofill ใน popup
   - ตรวจสอบว่าข้อมูลถูกกรอกครบ
   - ตรวจสอบว่า events ถูก dispatch (React รับรู้)

2. **Microsoft Forms:**
   - ทำเช่นเดียวกับ Google Forms

3. **Skip Test:**
   - กรอกบาง field ด้วยมือ
   - กด Autofill
   - ตรวจสอบว่า field ที่กรอกไว้แล้วไม่ถูกเขียนทับ

4. **Error Handling:**
   - ปิด backend → กด Autofill → แสดง error message
   - เปิด unsupported page → ปุ่ม Autofill disabled

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `extension/fill-engine.js` | **NEW** | Form fill engine — จัดการการกรอกทุก input type |
| `extension/background.js` | MODIFY | เพิ่ม proxy handler สำหรับ MATCH_QUESTIONS |
| `extension/content.js` | MODIFY | เพิ่ม START_AUTOFILL handler + orchestration |
| `extension/popup.html` | MODIFY | เพิ่ม loading, result summary, auto submit toggle |
| `extension/popup.js` | MODIFY | เพิ่ม autofill flow, backend health check |
| `extension/options.js` | NO CHANGE | backendUrl เก็บอยู่แล้ว |
| `extension/adapters/*.js` | NO CHANGE | ใช้ bindings ที่มีอยู่แล้ว |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Google/Microsoft เปลี่ยน DOM | Fill engine หา element ไม่เจอ | ใช้ adapter bindings ที่ robust แล้ว |
| React form ไม่รับค่าจาก JS | กรอกแล้ว form ไม่รู้เรื่อง | dispatch events ครบ (input, change, blur) |
| Background service worker ถูก suspend | API request หาย | ใช้alarms API หรือ extend lifetime |
| CORS blocked | Content script เรียก API ไม่ได้ | ใช้ background proxy (ออกแบบมาอยู่แล้ว) |
