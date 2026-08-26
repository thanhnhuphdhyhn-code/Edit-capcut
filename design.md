# Thiết kế giao diện — Piper TTS Viet Editor

## Mục tiêu trải nghiệm

Piper TTS Viet Editor là công cụ tạo lồng tiếng tiếng Việt từ phụ đề, hướng đến người làm video ngắn và nội dung dài. Ứng dụng ưu tiên thao tác bằng một tay ở chế độ dọc 9:16, hiển thị rõ tiến độ xử lý và giúp người dùng phát hiện sớm các câu đọc vượt thời lượng phụ đề.

Giao diện tuân theo các nguyên tắc iOS HIG: phân cấp thông tin rõ ràng, vùng chạm tối thiểu 44 điểm, thanh hành động chính ở gần đáy màn hình và các thay đổi quan trọng phản hồi tức thời bằng trạng thái, haptic nhẹ hoặc bảng xác nhận.

## Màu sắc và nhận diện

| Token | Màu | Vai trò |
|---|---|---|
| Nền đêm | `#101315` | Nền chính, giảm mỏi mắt khi biên tập video |
| Bề mặt than | `#1B2024` | Card, panel, thanh công cụ |
| Bề mặt nâng | `#252B30` | Ô chọn, timeline và trường nhập liệu |
| Xanh âm thanh | `#2EA7FF` | Hành động TTS, nút nghe thử, trạng thái đang xử lý |
| Xanh ngọc hoàn tất | `#3DDC97` | Audio đã tạo và đoạn khớp thời lượng |
| Cam cảnh báo | `#FFB547` | Đoạn đã tăng tốc tự động |
| Đỏ quá thời lượng | `#FF6B6B` | Đoạn cần người dùng xử lý |
| Văn bản chính | `#F4F7F9` | Tiêu đề, nội dung chính |
| Văn bản phụ | `#9BA6AE` | Nhãn, mốc thời gian, mô tả |

## Danh sách màn hình

| Màn hình | Nội dung chính | Chức năng |
|---|---|---|
| Dự án | Danh sách các dự án đã lưu, nút tạo dự án | Tạo, mở, đổi tên và xóa dự án cục bộ |
| Biên tập phụ đề | Thanh công cụ, danh sách dòng SRT, thanh hành động đáy | Nhập SRT/TXT, sửa câu, tạo audio từng dòng/hàng loạt, phát hiện chồng lấn |
| Cấu hình giọng đọc | Engine Piper offline, ngôn ngữ Việt Nam, chọn model giọng, Speed, Pitch | Chọn giọng mặc định, nghe thử, áp dụng cho toàn dự án |
| Chi tiết dòng phụ đề | Nội dung văn bản, mốc bắt đầu/kết thúc, audio tạo ra, tốc độ thực tế | Chỉnh văn bản, tạo lại giọng, ghi đè tốc độ, phát thử, xem cảnh báo |
| Timeline | Track video, TTS, nhạc nền và thước thời gian | Xem vị trí audio theo SRT, chọn đoạn, điều chỉnh âm lượng và nghe preview |
| Xuất video | Tên tệp, độ phân giải, chất lượng, tiến độ | Xuất MP4 khi có video; hoặc xuất WAV cho toàn bộ audio |
| Cài đặt | Thư mục lưu, tốc độ mặc định, tốc độ tối đa tự động, chính sách model | Lưu cấu hình cục bộ và kiểm tra model Piper đã cài |

## Bố cục màn hình Biên tập phụ đề

Đầu màn hình là thanh tiêu đề gồm tên dự án, trạng thái lưu và menu. Bên dưới là hàng hành động nhập SRT/TXT, thêm video, cùng công tắc cố định “Tự động tăng tốc khi chồng lấn”. Vùng nội dung dùng danh sách card; mỗi card hiển thị số thứ tự, khoảng thời gian, câu phụ đề, thời lượng audio, tốc độ hiệu lực và badge trạng thái. Card có các thao tác nhanh: phát thử, tạo audio và mở chi tiết.

Thanh hành động đáy luôn có nút chính “Tạo tất cả”, kèm chỉ báo `x / tổng số` trong lúc xử lý. Khi dự án đã có audio, nút này chuyển thành “Mở timeline” để giảm số bước trong luồng chính.

## Bố cục màn hình Cấu hình giọng đọc

Màn hình dùng các card chọn kiểu ảnh mẫu của người dùng. Thứ tự cố định: Engine TTS, Ngôn ngữ, Giọng thuyết minh và Tùy chỉnh giọng đọc. Card cuối có hai control lớn cho Speed và Pitch, nút “Nghe thử” màu xanh ở phía phải. Giọng mặc định hiển thị “Lão Kim (Nam Tự Tin)” chỉ khi model tương ứng đã được người dùng cài hoặc nhập hợp lệ; nếu chưa có model, app hiển thị trạng thái “Cần cài model” thay vì giả vờ có thể phát.

## Luồng người dùng chính

### Tạo lồng tiếng từ SRT

Người dùng tạo dự án, chọn Import SRT, xem và sửa danh sách phụ đề. Sau khi chọn giọng Piper, người dùng bật tùy chọn chống chồng lấn rồi chạm “Tạo tất cả”. Ứng dụng tạo audio theo thứ tự, hiển thị tiến độ, đo thời lượng từng đoạn và áp dụng tăng tốc trong giới hạn đã chọn. Các dòng không thể khớp được gắn cờ đỏ để người dùng sửa câu hoặc điều chỉnh thủ công.

### Chỉnh một dòng có vấn đề

Người dùng chạm card màu cam/đỏ, sửa nội dung hoặc chọn tốc độ riêng, nghe thử rồi tạo lại audio. Nếu audio còn dài hơn khung cho phép, app hiển thị thời lượng dư thay vì tự cắt mất phần giọng nói.

### Xem timeline và xuất

Người dùng mở timeline để xem video và audio TTS trên cùng thước thời gian. Sau khi kiểm tra, người dùng mở Xuất video, chọn độ phân giải và bắt đầu export. Nếu chưa chọn video nguồn, app cho phép xuất audio tổng hợp thay vì hiển thị thao tác xuất MP4 không khả dụng.

## Mô hình dữ liệu cốt lõi

| Kiểu dữ liệu | Thuộc tính chính |
|---|---|
| Project | id, title, createdAt, sourceVideoUri, subtitles, voiceSettings |
| SubtitleCue | id, index, startMs, endMs, text, audioUri, audioDurationMs, effectiveSpeed, status |
| VoiceSettings | engine, locale, voiceId, voiceLabel, speed, pitch, autoFitEnabled, maxAutoSpeed |
| ExportPreset | format, resolution, bitrate, destinationUri |

## Nguyên tắc xử lý ngoại lệ

Tệp SRT sai cú pháp cần chỉ rõ block lỗi. Khi model Piper chưa tồn tại hoặc không tương thích, app phải ngăn thao tác tạo audio và hiển thị cách cài model. Khi quá thời lượng, app không tự tăng quá `maxAutoSpeed`; dòng đó được đánh dấu cần xử lý. Tất cả thay đổi dự án được lưu cục bộ trước khi chạy tác vụ nặng để người dùng không mất công việc nếu thoát ứng dụng.
