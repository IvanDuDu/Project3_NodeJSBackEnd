# IoT Camera Server

Hệ thống server IoT Camera sử dụng Node.js, Express, MongoDB và MQTT (EMQX) để quản lý thiết bị camera và xử lý streaming.

## 📋 Mục lục

- [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
- [Cài đặt](#cài-đặt)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [API Documentation](#api-documentation)
- [MQTT Topics](#mqtt-topics)
- [Chạy dự án](#chạy-dự-án)

## 🔧 Yêu cầu hệ thống

- Node.js >= 16.0.0
- MongoDB
- Docker và Docker Compose (cho EMQX)
- npm hoặc yarn

## 📦 Cài đặt

### 1. Clone dự án và cài đặt dependencies

```bash
npm install
```

### 2. Cấu hình môi trường

Tạo file `.env` và cấu hình các biến:

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/iot_camera_db
JWT_SECRET=your_jwt_secret_key_here_change_in_production
JWT_EXPIRE=7d
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=admin
MQTT_PASSWORD=public
MQTT_CLIENT_ID=iot_server_client
CORS_ORIGIN=*
```

### 3. Khởi động EMQX và MongoDB bằng Docker

```bash
docker-compose up -d
```

Kiểm tra EMQX Dashboard: http://localhost:18083
- Username: `admin`
- Password: `public`

## 📁 Cấu trúc dự án

```
iot-camera-server/
├── src/
│   ├── models/              # Database Models
│   │   ├── User.js
│   │   ├── Device.js
│   │   └── Record.js
│   ├── controllers/         # Business Logic
│   │   ├── userController.js
│   │   ├── deviceController.js
│   │   └── pairingController.js
│   ├── routes/             # API Routes
│   │   ├── userRoutes.js
│   │   ├── deviceRoutes.js
│   │   └── pairRoutes.js
│   ├── middleware/         # Custom Middleware
│   │   ├── auth.js
│   │   └── errorHandler.js
│   ├── services/           # External Services
│   │   └── mqttService.js
│   ├── config/             # Configuration
│   │   └── database.js
│   ├── utils/              # Helper Functions
│   │   ├── tokenGenerator.js
│   │   └── validators.js
│   ├── app.js              # Express App
│   └── server.js           # Server Entry
├── .env
├── docker-compose.yml
└── package.json
```

## 🚀 Chạy dự án

### Development mode (với nodemon)

```bash
npm run dev
```

### Production mode

```bash
npm start
```

## 📡 API Documentation

### Authentication

#### 1. Đăng ký (Register)
```http
POST /api/user/signin
Content-Type: application/json

{
  "username": "testuser",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "userId": "...",
    "username": "testuser",
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

#### 2. Đăng nhập (Login)
```http
POST /api/user/login
Content-Type: application/json

{
  "username": "testuser",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "userId": "...",
    "username": "testuser",
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

#### 3. Xóa tài khoản
```http
DELETE /api/user/account
Authorization: Bearer <token>
```

#### 4. Cập nhật tài khoản
```http
POST /api/user/account
Authorization: Bearer <token>
Content-Type: application/json

{
  "username": "newusername",
  "password": "currentpassword",
  "newPassword": "newpassword123"
}
```

### Device Management

#### 5. Lấy danh sách thiết bị
```http
GET /api/user/:userID/deviceList
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "...",
      "token": "a1b2c3d4e5f6g7h8",
      "status": "OFF",
      "lastSeen": "2024-01-01T00:00:00.000Z",
      "recordList": ["..."]
    }
  ]
}
```

#### 6. Lấy danh sách bản ghi (Memory List)
```http
GET /api/user/:userID/device/:deviceID/memoryList
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "_id": "...",
      "folderName": "recording_20240101_120000",
      "fileCount": 100,
      "size": 1024000,
      "uploadStatus": "completed",
      "createdAt": "2024-01-01T12:00:00.000Z"
    }
  ]
}
```

#### 7. Gửi lệnh Memory (MEM)
```http
POST /api/user/:userID/device/:deviceID/MEM
Authorization: Bearer <token>
Content-Type: application/json

{
  "recordID": "..."
}
```

#### 8. Gửi lệnh Streaming (STM)
```http
POST /api/user/:userID/device/:deviceID/STM
Authorization: Bearer <token>
Content-Type: application/json

{
  "action": "ON"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Streaming on command sent successfully",
  "data": {
    "streamUrl": "http://192.168.1.100:8080/stream",
    "status": "streaming"
  }
}
```

#### 9. Lấy trạng thái tất cả thiết bị
```http
GET /api/device/:userID/status
Authorization: Bearer <token>
```

#### 10. Lấy trạng thái một thiết bị
```http
GET /api/device/:userID/status/:deviceID
Authorization: Bearer <token>
```

### Device Pairing

#### 11. Khởi tạo ghép đôi
```http
GET /api/pair/:userID
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Pairing initiated. Please configure your device with this token.",
  "data": {
    "token": "a1b2c3d4e5f6g7h8",
    "expiresIn": "5 minutes",
    "instructions": "Configure your device to publish to topic: api/a1b2c3d4e5f6g7h8/pair"
  }
}
```

#### 12. Kiểm tra trạng thái ghép đôi
```http
GET /api/pair/:userID/status/:token
Authorization: Bearer <token>
```

#### 13. Hủy ghép đôi
```http
DELETE /api/pair/:userID/device/:deviceID
Authorization: Bearer <token>
```

## 📨 MQTT Topics

### Topics từ Device gửi lên Server

1. **Pairing Request**
   - Topic: `api/{token}/pair`
   - Payload: `{"deviceInfo": "..."}`

2. **Status Updates**
   - Memory Status: `api/{token}/cam/memory/status`
   - Stream Status: `api/{token}/cam/stream/status`
   - Connect Status: `api/{token}/cam/connect/status`
   - Payload: `"ON"` hoặc `"OFF"`

3. **New Record Notification**
   - Topic: `api/{token}/cam/record`
   - Payload: `{"folderName": "recording_20240101_120000"}`

4. **Command Responses**
   - Memory Response: `api/{token}/cam/memory`
   - Streaming Response: `api/{token}/cam/streaming`
   - Payload: JSON với kết quả

### Topics từ Server gửi xuống Device

1. **Memory Command**
   - Topic: `api/{token}/cam/memory`
   - Payload: 
   ```json
   {
     "command": "GET_MEMORY",
     "recordID": "...",
     "folderName": "recording_20240101_120000"
   }
   ```

2. **Streaming Command**
   - Topic: `api/{token}/cam/streaming`
   - Payload:
   ```json
   {
     "command": "START_STREAMING",
     "action": "ON"
   }
   ```

## 🔐 Authentication

Tất cả các API (trừ login và register) đều yêu cầu JWT token trong header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 🗄️ Database Schema

### User
```javascript
{
  username: String,
  password: String (hashed),
  deviceList: [ObjectId],
  createdAt: Date,
  updatedAt: Date
}
```

### Device
```javascript
{
  token: String,
  status: Enum['OFF', 'STREAMING', 'MEMORY', 'RECORDING'],
  recordList: [ObjectId],
  lastSeen: Date,
  streamingUrl: String,
  isPaired: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### Record
```javascript
{
  folderName: String,
  deviceId: ObjectId,
  fileCount: Number,
  size: Number,
  uploadStatus: Enum['pending', 'uploading', 'completed', 'failed'],
  metadata: {
    duration: Number,
    resolution: String,
    fps: Number
  },
  createdAt: Date,
  updatedAt: Date
}
```

## 🐛 Debugging

Xem logs từ MQTT:
```bash
docker logs -f emqx_broker
```

Xem logs từ MongoDB:
```bash
docker logs -f mongodb
```

## 📝 Notes

- JWT token mặc định expire sau 7 ngày
- Pairing token expire sau 5 phút
- Device được coi là offline nếu không phản hồi sau 5 phút
- Tất cả password được hash bằng bcrypt
- MQTT sử dụng QoS 0 mặc định

## 🤝 Contributing

Nếu bạn muốn đóng góp cho dự án, vui lòng tạo Pull Request.

## 📄 License

ISC
