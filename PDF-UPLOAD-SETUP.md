# QR Forever — PDF Upload

หน้าเว็บ: https://eirchard.github.io/QrCode/

## สถานะและการใช้งาน
- ผู้ใช้ทั่วไป: เปิดเว็บ → เลือก **ไฟล์ PDF** → เลือกไฟล์ (ไม่เกิน 5 MB) → ผ่าน Turnstile → กด **อัปโหลดและสร้าง QR Code** → ดาวน์โหลด PNG/SVG
- ไม่ต้องสมัครสมาชิกหรือเข้าสู่ระบบ และไม่ต้องนำไฟล์ขึ้น Google Drive เอง
- ระบบจัดเก็บ: Supabase project `qr-forever-documents`, bucket `qr-forever-public-pdfs`
- API: `pdf-public-upload` (Supabase Edge Function)
- **ไฟล์ไม่ถูกลบอัตโนมัติ** จะเก็บไว้จนผู้ดูแลลบเอง โดยขึ้นอยู่กับสถานะบริการและโควตา

## ตั้งค่า Turnstile ครั้งเดียว
- Site Key (public) อยู่ใน GitHub `index.html`
- เปิด Supabase > `qr-forever-documents` > Edge Functions > Secrets
- เพิ่ม **TURNSTILE_SECRET_KEY** เป็น Secret Key จาก Cloudflare Turnstile แล้วกด Save
- ห้ามใส่ Secret Key ใน GitHub, โค้ดฝั่งหน้าเว็บ หรือส่งในแชต
- Widget ของ Cloudflare ต้องอนุญาต hostname: `eirchard.github.io`
- Edge Function จะตรวจ token กับ Cloudflare Siteverify โดยตรวจทั้ง `success`, `hostname` และ `action` ก่อนรับไฟล์
- ตรวจสถานะทาง `GET https://efxyzgdbjckoyxxqntxj.supabase.co/functions/v1/pdf-public-upload` (แสดง `ready: true` เมื่อพบ secret, ไม่เปิดเผย secret)

## ข้อจำกัดป้องกันพื้นที่เต็ม
- PDF สูงสุด 5 MB/ไฟล์
- สูงสุด 3 ไฟล์จากเครือข่ายหนึ่งใน 24 ชั่วโมง
- สูงสุด 20 ไฟล์รวมต่อ 24 ชั่วโมง
- เก็บรวมได้สูงสุด 150 MB / 100 ไฟล์ ตามโควตาภายในของแอป
- เป็นไฟล์สาธารณะ: ใครมี QR/URL ก็เปิดได้ ห้ามใช้กับเอกสารลับ/ข้อมูลส่วนบุคคล
- QR Code จะยังคงรูปเดิม แต่ PDF เปิดไม่ได้หากลบไฟล์หรือโปรเจกต์จัดเก็บใช้งานไม่ได้

## วิธีลบ PDF ด้วยตนเอง
1. เปิด Supabase > `qr-forever-documents` > Storage > bucket `qr-forever-public-pdfs`
2. เลือกไฟล์ที่ต้องการลบจากโฟลเดอร์เดือนที่อัปโหลด แล้วลบ
3. หากต้องการให้บัญชีรายการในฐานข้อมูลตรงกัน ให้ลบรายการใน Table Editor > `qr_pdf_files` ที่มีค่า `file_path` เดียวกันด้วย
4. ไฟล์ไม่มีระบบลบอัตโนมัติ

## ทดสอบ
1. ตรวจ GET status `ready: true`
2. เปิดเว็บไซต์ด้วย HTTPS จริง (Turnstile อาจไม่ทำงานเมื่อเปิดไฟล์ผ่าน file://)
3. ลอง PDF ทดสอบที่ไม่เป็นความลับ ขนาดไม่เกิน 5 MB
4. ยืนยันว่าไฟล์อยู่ใน Supabase Storage, ดาวน์โหลดภาพ QR และสแกนเปิดเอกสารได้
5. ตรวจ log Edge Functions เมื่อเกิดข้อผิดพลาด
