# SmailBox - Sonjj/SmailPro Gmail Inbox Manager

Ứng dụng web multi-user để quản lý danh sách Gmail thủ công và đọc Gmail Inbox qua Sonjj/SmailPro API. Mỗi user chỉ truy cập API key, Gmail account và message thuộc chính họ.

## Chạy bằng một cú click

Double-click:

```text
CHAY-SMAILBOX.bat
```

Trên Windows VPS muốn mở cho máy ngoài truy cập, double-click:

```text
CHAY-SMAILBOX-VPS-WINDOWS.bat
```

File VPS sẽ tự xin quyền Administrator, cấu hình `HOST=0.0.0.0`, mở Windows Firewall port `3000`, build, migrate và chạy production. Nếu nhà cung cấp VPS có firewall/security group riêng, bạn vẫn cần mở thêm TCP port `3000` trên panel VPS.

Script sẽ tự động:

- Tạo `.env` nếu chưa có.
- Dùng SQLite local, không cần PostgreSQL/Docker.
- Cài dependencies nếu cần.
- Chạy Prisma migrate.
- Build client/server.
- Tìm port trống và mở trình duyệt.

Database được lưu tại `server/prisma/smailpro.db`.

## Luồng sử dụng

1. Đăng ký/đăng nhập SmailBox.
2. Mở **Cài đặt**.
3. Dán `X-Api-Key` lấy từ Sonjj/SmailPro.
4. Bấm **Kiểm tra kết nối**, sau đó **Lưu API key**.
5. Trong **Timestamp lấy inbox**, chọn ngày giờ bắt đầu lấy inbox; hệ thống tự convert sang Unix timestamp rồi bấm **Lưu timestamp**.
6. Mở **Gmail Accounts**, nhập Gmail cần theo dõi và bấm **Thêm Gmail**.
7. Chọn Gmail, bấm refresh để fetch inbox; click message để tải body.

Danh sách **Gmail Accounts** không được lấy tự động từ Sonjj nữa. Bạn tự thêm/xóa email trong app. Sonjj chỉ được gọi khi kiểm tra API key, refresh inbox hoặc tải nội dung message.

Khi refresh inbox, server tự động dùng timestamp đã lưu trong hồ sơ nếu request không truyền timestamp riêng.

## Build và chạy production

```powershell
npm.cmd ci
npm.cmd run db:generate
npm.cmd run db:deploy
npm.cmd run build
$env:NODE_ENV="production"
npm.cmd start
```

## Development

```powershell
npm.cmd install
npm.cmd run db:generate
npm.cmd run db:deploy
npm.cmd run dev
```

## Internal API

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/auth/register` | Đăng ký |
| POST | `/auth/login` | Đăng nhập |
| POST | `/auth/logout` | Đăng xuất |
| GET | `/me` | User hiện tại |
| GET/POST/DELETE | `/profile/api-config` | Quản lý API key |
| POST | `/profile/api-config/test` | Kiểm tra API key |
| GET | `/profile/inbox-config` | Lấy timestamp fetch inbox |
| PUT | `/profile/inbox-config` | Lưu timestamp fetch inbox |
| GET | `/gmail/accounts` | Gmail đã lưu |
| POST | `/gmail/accounts` | Thêm Gmail thủ công |
| DELETE | `/gmail/accounts/:email` | Xóa Gmail khỏi danh sách |
| GET | `/gmail/:email/inbox` | Inbox trong DB |
| POST | `/gmail/:email/inbox/fetch` | Fetch inbox từ Sonjj |
| GET | `/gmail/:email/inbox/search` | Search sender/subject |
| GET | `/gmail/:email/messages/:mid` | Message trong DB |
| POST | `/gmail/:email/messages/:mid/fetch` | Fetch message body |

## Kiểm tra

```powershell
npm.cmd test
npm.cmd run build
```

Tài liệu API: [Sonjj API](https://sonjj.com/docs/?brand=smailpro.com).
