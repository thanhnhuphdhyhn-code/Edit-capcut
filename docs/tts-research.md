# Ghi chú nghiên cứu TTS offline

## Piper và model giọng

Piper là hệ thống tổng hợp giọng nói thần kinh chạy cục bộ. Kho `rhasspy/piper` đã được lưu trữ và thông báo việc phát triển chuyển sang `OHF-Voice/piper1-gpl`. Danh sách giọng Piper cũ có ba mục tiếng Việt `25hours_single`, `vais1000` và `vivos`; danh sách đó không xác nhận model có tên “Lão Kim (Nam Tự Tin)”. Vì vậy ứng dụng không được tuyên bố model Lão Kim đã có sẵn: giọng này chỉ là lựa chọn cấu hình mặc định và cần một gói ONNX có quyền sử dụng rõ ràng.

| Nguồn | Kết luận áp dụng |
|---|---|
| https://github.com/rhasspy/piper | Piper là engine TTS local; kho cũ đã archive và trỏ tới OHF-Voice/piper1-gpl. |
| https://github.com/OHF-Voice/piper1-gpl | Hướng phát triển hiện tại cần theo dõi khi cập nhật engine. |
| https://github.com/rhasspy/piper/blob/master/VOICES.md | Danh sách model Piper cũ liệt kê `25hours_single`, `vais1000`, `vivos` cho `vi_VN`. |

## Lộ trình runtime Android

Sherpa-ONNX có thể chuyển model Piper sang dạng VITS cho Android. Tài liệu chuyển đổi mô tả model cần có ONNX, file cấu hình để tạo `tokens.txt`, metadata Piper/VITS và gói `espeak-ng-data`. Tài liệu React Native Sherpa-ONNX nêu rõ bridge có thể tạo TTS offline trên Android API 24+, hỗ trợ model VITS/Piper, tạo audio buffer và lưu WAV; gói yêu cầu native build, nên không chạy trong bản xem trước web.

| Nguồn | Kết luận áp dụng |
|---|---|
| https://k2-fsa.github.io/sherpa/onnx/tts/piper.html | Model Piper được chuyển đổi cho Sherpa-ONNX; cần ONNX, `tokens.txt` và `espeak-ng-data`. |
| https://xdcobra-react-native-sherpa-onnx.mintlify.app/introduction | React Native bridge hỗ trợ TTS offline Android, VITS bao gồm Piper, model từ assets hoặc filesystem. |
| https://xdcobra-react-native-sherpa-onnx.mintlify.app/features/text-to-speech | API `createTTS`, `generateSpeech` và `saveAudioToFile` hỗ trợ tạo WAV; speed là tham số trực tiếp. |
| https://xdcobra-react-native-sherpa-onnx.mintlify.app/installation | Cài `react-native-sherpa-onnx` cùng `@dr.pogodin/react-native-fs`; Android native dependencies được Gradle xử lý khi build tùy chỉnh. |

## Quyết định triển khai

Dự án dùng `react-native-sherpa-onnx` làm bridge native. Ứng dụng chỉ kích hoạt tạo WAV sau khi người dùng cài gói model `.tar.zst` hoặc `.tar.bz2` chứa đủ cấu trúc Piper; app không tạo audio giả lập khi không có model. Kiểm soát Speed được gửi vào Sherpa-ONNX. Pitch được lưu trong cấu hình giao diện nhưng cần bước DSP/export chuyên dụng trước khi có thể hứa áp dụng thay đổi cao độ trên WAV.
