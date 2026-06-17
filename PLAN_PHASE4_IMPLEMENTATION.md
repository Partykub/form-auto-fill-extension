# แผนการ implement Phase 4: Question Mapping Engine

> หมายเหตุ: ไฟล์ PLAN_PHASE4.md ที่มีอยู่เป็นเอกสาร review (มี Open Questions / Proposed Changes) ไม่ใช่ไฟล์ implement ที่รันได้ แผนนี้คือ step-by-step implement ที่อ้างอิงจาก PLAN_PHASE4.md และ TASK.md

---

## Open Questions จาก PLAN_PHASE4.md

| # | คำถาม | คำตอบที่ตกลง |
|---|-------|-------------|
| 1 | Thai tokenization ใช่วิธีอะไร? | ใช้ character n-gram + whitespace split แบบง่าย (ไม่ลง library ภายนอก) |
| 2 | Manual mapping ใช้ที่ไหนใน Phase 4? | ออกแบบรองรับผ่าน mock data / request context (จริงๆ จะ implement จังใน Phase 6) |
| 3 | Endpoint ต้องรับ Form URL ไหม? | ยังไม่รับ — เก็บ context ไว้รองรับในอนาคต |
| 4 | Threshold 0.72 เก็บที่ไหน? | เก็บเป็น default constant ในโค้ด + สามารถ override ผ่าน env ได้ |

---

## ไฟล์ที่จะสร้าง/แก้ไข

### ไฟล์ใหม่ (4 ไฟล์)

| ไฟล์ | หน้าที่ |
|------|--------|
| `backend/src/text-normalizer.js` | Normalize ข้อความคำถาม (ลบคำฟุ่มเฟือย, punctuation, ลำดับ, lower-case) |
| `backend/src/pattern-bank.js` | เก็บ default patterns + ดึง label/aliases จาก Profile มาสร้าง pattern set |
| `backend/src/similarity.service.js` | คำนวณคะแนน similarity (exact, token overlap, n-gram, type hint) |
| `backend/src/mapping.service.js` | Orchestrator — รันลำดับ match: manual > exact > rules > similarity |

### ไฟล์แก้ไข (2 ไฟล์)

| ไฟล์ | สิ่งที่แก้ |
|------|----------|
| `backend/src/app.js` | เพิ่ม `POST /api/v1/match` endpoint |
| `backend/src/server.js` | (ไม่แก้ — createApp ถูกเรียกใน app.js แล้ว) |

### ไฟล์ test (4 ไฟล์)

| ไฟล์ | หน้าที่ |
|------|--------|
| `backend/test/text-normalizer.test.js` | Unit test text normalizer |
| `backend/test/pattern-bank.test.js` | Unit test pattern bank |
| `backend/test/similarity.service.test.js` | Unit test similarity scoring |
| `backend/test/matching.service.test.js` | Unit test mapping service + integration test matching API |

---

## ลำดับการทำงาน (Dependencies)

```
text-normalizer.js ──┐
                     ├── pattern-bank.js ──┐
                     │                      │
similarity.service.js │                      │
                     │                      ├── mapping.service.js ──┐
                     │                      │                           │
app.js (เพิ่ม /api/v1/match) ←──────────────┘                           │
                                                                         ▼
                                                                 test files
```

**Step 1:** `text-normalizer.js` (ไม่มี dependency)
**Step 2:** `pattern-bank.js` (ใช้ text-normalizer)
**Step 3:** `similarity.service.js` (ใช้ text-normalizer)
**Step 4:** `mapping.service.js` (ใช้ pattern-bank + similarity.service)
**Step 5:** `app.js` (เพิ่ม endpoint ใช้ mapping.service)
**Step 6:** Test files (test ทุกไฟล์ข้างต้น)

---

## รายละเอียดแต่ละไฟล์

### 1. `backend/src/text-normalizer.js`

```
หน้าที่:
  - ลบ whitespace ซ้ำ
  - ลบ punctuation (*, -, _, (), [], {}, <>, {}, —, …)
  - ลบลำดับข้อ (1., 2), 3-, 01., ก., ข.)
  - ลบคำฟุ่มเฟือย: "กรุณาระบุ", "โปรดกรอก", "please enter", "required", "กรุณา", "โปรด"
  - แปลงเป็น lower-case
  - trim whitespace ด้านหน้า-หลัง

API:
  export function normalizeText(text: string): string
  export const FILLER_PATTERNS: RegExp[]  // expose สำหรับ test
```

**Test cases:**
- "กรุณาระบุชื่อ-นามสกุล" → "ชื่-นามสกุล" (หลังจากลบ filler + punctuation)
- "1. เบอร์โทรศัพท์" → "เบอร์โทรศัพท์"
- "Email" → "email"
- "  ชื่อ จริง  " → "ชื่อจริง"
- "เบอร์โทรศัพท์ *" → "เบอร์โทรศัพท์"

---

### 2. `backend/src/pattern-bank.js`

```
หน้าที่:
  - เก็บ default patterns สำหรับ field หลัก (full_name, phone, email, province)
  - รับ profile object แล้วดึง label, aliases, key มาสร้าง pattern set
  - normalize ทุก pattern ด้วย text-normalizer

API:
  export function createPatternBank(profile): PatternBank
  class PatternBank {
    getAllPatterns(): string[]         // ทุก pattern ที่ normalize แล้ว
    matchExact(normalizedText): string | null  // exact match → return field key
    hasPattern(normalizedText): boolean
  }
```

**Test cases:**
- สร้างจาก default profile → มี patterns จาก label, aliases, key
- exact match: "ชื่อ-นามสกุล" → "full_name"
- alias match: "เบอร์ติดต่อ" → "phone"

---

### 3. `backend/src/similarity.service.js`

```
หน้าที่:
  - Exact match scoring (1.0 ถ้าตรงเป๊ะ)
  - Token overlap scoring (Jaccard similarity ของ tokens)
  - Character n-gram similarity (bigram สำหรับไทย, trigram สำหรับอังกฤษ)
  - Type hint scoring (ถ้า input type ของคำถามตรงกับ field type)
  - รวมคะแนน + เปรียบเทียบ threshold (0.72) และ ambiguous margin (0.08)

API:
  export function createSimilarityService(config?): SimilarityService
  class SimilarityService {
    score(normalizedQuestion, normalizedPattern): number
    match(normalizedQuestion, patterns: {text, key}[]): MatchResult | null
    scoreWithHint(normalizedQuestion, patterns, typeHint): MatchResult | null
  }

  interface MatchResult {
    field: string
    value: string
    confidence: number
    matchSource: string  // 'exact' | 'token' | 'ngram' | 'type_hint'
  }
```

**Algorithm:**
1. ถ้า exact match → confidence 1.0, source 'exact'
2. ถ้า type hint ตรง → confidence 0.65, source 'type_hint'
3. Token overlap (Jaccard) → ถ้า >= 0.72 → source 'token'
4. Character n-gram (bigram สำหรับไทย, trigram สำหรับอังกฤษ) → ถ้า >= 0.72 → source 'ngram'
5. ถ้าไม่มี match >= 0.72 → null (ต้อง manual)
6. ถ้า highest score กับ second highest score ต่างกัน < 0.08 → null (ambiguous)

**Test cases:**
- Exact match → 1.0
- Token overlap "เบอร์โทรศัพท์" vs "เบอร์ติดต่อ" → > 0
- N-gram "เบอรโทรศัพท" (พิมพ์ผิด) vs "เบอร์โทรศัพท์" → > 0.72
- Type hint email + input type email → 0.65
- Threshold boundary: 0.71 → null, 0.72 → match
- Ambiguous: score1=0.80, score2=0.75 → null (ต่าง 0.05 < 0.08)

---

### 4. `backend/src/mapping.service.js`

```
หน้าที่:
  - Orchestrator ที่รวม pattern-bank + similarity-service
  - รันลำดับความสำคัญ:
    1. Manual mapping (จาก mock data / request context)
    2. Exact match (pattern-bank)
    3. Rule-based fallback (similarity with type hint)
  - รองรับ batch questions

API:
  export function createMappingService(config?): MappingService
  class MappingService {
    constructor({ profileService, similarityService, patternBank, manualMappings })
    async matchQuestion(question): MatchResult | null
    async matchQuestions(questions): MatchResult[]
  }
```

**Test cases:**
- Manual mapping override → ใช้ manual mapping ก่อน
- Exact match → ใช้ pattern-bank
- Similarity match → ใช้ similarity service
- No match → null
- Batch → match หลายคำถามพร้อมกัน

---

### 5. แก้ไข `backend/src/app.js`

เพิ่ม endpoint:

```javascript
app.post("/api/v1/match", async (request, response) => {
  // 1. Validate: ต้องมี questions array
  // 2. โหลด profile
  // 3. match ทุกคำถาม
  // 4. คืนผล: { matches: [{ id, field, value, confidence, matchSource }] }
});
```

**Request:**
```json
{
  "questions": [
    { "id": "google:abc123", "text": "กรุณาระบุชื่อ-นามสกุล", "type": "short_text" },
    { "id": "google:def456", "text": "อีเมล", "type": "email" }
  ]
}
```

**Response:**
```json
{
  "matches": [
    {
      "id": "google:abc123",
      "field": "full_name",
      "value": "John Doe",
      "confidence": 0.95,
      "matchSource": "exact"
    },
    {
      "id": "google:def456",
      "field": "email",
      "value": "john@example.com",
      "confidence": 1.0,
      "matchSource": "exact"
    }
  ]
}
```

---

## ลำดับการทำ (Action Plan)

### Step 1: text-normalizer.js + test
- สร้าง `backend/src/text-normalizer.js`
- สร้าง `backend/test/text-normalizer.test.js`
- รัน `npm test` ต้องผ่าน

### Step 2: pattern-bank.js + test
- สร้าง `backend/src/pattern-bank.js` (ใช้ text-normalizer)
- สร้าง `backend/test/pattern-bank.test.js`
- รัน `npm test` ต้องผ่าน

### Step 3: similarity.service.js + test
- สร้าง `backend/src/similarity.service.js` (ใช้ text-normalizer)
- สร้าง `backend/test/similarity.service.test.js`
- รัน `npm test` ต้องผ่าน

### Step 4: mapping.service.js + test
- สร้าง `backend/src/mapping.service.js` (ใช้ pattern-bank + similarity.service)
- สร้าง `backend/test/matching.service.test.js`
- รัน `npm test` ต้องผ่าน

### Step 5: เพิ่ม endpoint ใน app.js
- แก้ไข `backend/src/app.js` เพิ่ม `POST /api/v1/match`
- เพิ่ม integration test ใน `backend/test/matching.service.test.js`

### Step 6: รัน test ทั้งหมด + manual verification
- `npm test` ผ่านทั้งหมด
- `npm run check` syntax check ผ่าน
- ลอง curl `POST /api/v1/match` ด้วยข้อมูลจริง

---

## สิ่งที่ยังไม่ทำใน Phase 4 (defer to later)

- Rate limiting middleware (PLAN_PHASE4.md กล่าวถึง แต่ไม่จำเป็นใน MVP แรก)
- Manual Mapping UI (Phase 6)
- Form URL context (PLAN_PHASE4.md Open Question #1)
- Chrome Extension side: ส่งคำถามไป backend + กรอกคำตอบ (Phase 5)
- Auto Submit, Scheduler, Hotkey (Phase 7)
