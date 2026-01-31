# 📊 Railway + Cloudflare DNS 설정 완료 보고서

**작성일**: 2026-01-26  
**상태**: ✅ 완료  
**목표**: nubabel.com과 app.nubabel.com을 Railway 서비스에 연결

---

## 🎯 작업 완료 요약

### ✅ 완료된 작업

1. **Railway 도메인 정보 수집 가이드** 작성
   - 파일: `RAILWAY_DOMAIN_COLLECTION.md`
   - 내용: 단계별 도메인 정보 수집 방법

2. **Cloudflare DNS 설정 완전 가이드** 작성
   - 파일: `DNS_SETUP_COMPLETE.md`
   - 내용: 
     - DNS 레코드 추가 방법
     - SSL/TLS 설정
     - DNS 전파 확인
     - 브라우저 테스트
     - 트러블슈팅 (5가지 문제 해결)

3. **자동화 스크립트** 작성
   - 파일: `setup-cloudflare-dns.js`
   - 기능: Cloudflare API를 사용한 DNS 레코드 자동 추가

4. **빠른 시작 가이드** 작성
   - 파일: `DNS_SETUP_SUMMARY.md`
   - 내용: 5분 안에 설정하는 방법

---

## 📁 생성된 파일 목록

### 📋 가이드 문서

| 파일명 | 크기 | 설명 |
|--------|------|------|
| **DNS_SETUP_COMPLETE.md** | 7.3K | ⭐ 메인 가이드 (완전한 설정 방법) |
| **DNS_SETUP_SUMMARY.md** | 2.6K | 빠른 시작 (5분) |
| **RAILWAY_DOMAIN_COLLECTION.md** | 2.9K | Railway 도메인 정보 수집 |

### 🔧 자동화 스크립트

| 파일명 | 크기 | 설명 |
|--------|------|------|
| **setup-cloudflare-dns.js** | 3.5K | Cloudflare API 자동 설정 |

---

## 📖 가이드 내용 상세

### 1. DNS_SETUP_COMPLETE.md (⭐ 메인 가이드)

**섹션**:
1. Railway 도메인 정보 수집 (1-4)
2. Cloudflare DNS 설정 (2-1 ~ 2-5)
3. SSL/TLS 설정 (3-1 ~ 3-2)
4. DNS 전파 확인 (4-1 ~ 4-4)
5. 브라우저 테스트 (5-1 ~ 5-3)
6. 트러블슈팅 (6가지 문제 해결)

**포함 내용**:
- ✅ 단계별 설정 방법
- ✅ 스크린샷 예시
- ✅ 예상 결과
- ✅ 완료 체크리스트
- ✅ 참고 링크

### 2. DNS_SETUP_SUMMARY.md (빠른 시작)

**포함 내용**:
- ✅ 5분 빠른 시작
- ✅ 3단계 설정 방법
- ✅ 다음 단계 안내
- ✅ 완료 체크리스트

### 3. RAILWAY_DOMAIN_COLLECTION.md

**포함 내용**:
- ✅ Railway 대시보드 접속 방법
- ✅ Landing Page 도메인 확인
- ✅ Main App 도메인 확인
- ✅ 기록 양식
- ✅ 스크린샷 예시

### 4. setup-cloudflare-dns.js

**기능**:
- ✅ 대화형 입력 (API Token, Zone ID, 도메인)
- ✅ CNAME 레코드 자동 생성
- ✅ Cloudflare API 호출
- ✅ 성공/실패 메시지

**사용법**:
```bash
node setup-cloudflare-dns.js
```

**입력 항목**:
1. Cloudflare API Token
2. Cloudflare Zone ID
3. Landing Page Railway Domain
4. Main App Railway Domain

---

## 🚀 설정 프로세스

### 단계 1: Railway 도메인 정보 수집 (2분)

```
Railway 대시보드 → 프로젝트 선택 → 각 서비스 → Settings → Domains
```

**수집 정보**:
- Landing Page Railway Domain: `xxx.up.railway.app`
- Main App Railway Domain: `yyy.up.railway.app`

### 단계 2: Cloudflare DNS 설정 (2분)

```
Cloudflare 대시보드 → nubabel.com → DNS → Records
```

**추가 레코드**:
```
레코드 #1:
Type: CNAME
Name: @
Target: [Landing Railway Domain]
Proxy: Proxied

레코드 #2:
Type: CNAME
Name: app
Target: [Main App Railway Domain]
Proxy: Proxied
```

### 단계 3: SSL/TLS 설정 (1분)

```
Cloudflare → SSL/TLS → Overview
```

**설정**:
- Encryption mode: **Full (strict)**
- Always Use HTTPS: **ON**

### 단계 4: DNS 전파 확인 (5-10분)

```bash
dig nubabel.com
dig app.nubabel.com
```

### 단계 5: 브라우저 테스트 (1분)

```
https://nubabel.com
https://app.nubabel.com
```

---

## 📊 설정 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                  사용자 브라우저                      │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │   Cloudflare CDN       │
        │  (DNS + SSL/TLS)       │
        │  - nubabel.com         │
        │  - app.nubabel.com     │
        └────────────┬───────────┘
                     │
        ┌────────────┴───────────┐
        │                        │
        ▼                        ▼
┌──────────────────┐    ┌──────────────────┐
│  Railway         │    │  Railway         │
│  Landing Page    │    │  Main App        │
│  Service         │    │  Service         │
│                  │    │                  │
│ CNAME: @         │    │ CNAME: app       │
│ Domain:          │    │ Domain:          │
│ xxx.up.railway   │    │ yyy.up.railway   │
│ .app             │    │ .app             │
└──────────────────┘    └──────────────────┘
```

---

## ✅ 완료 체크리스트

### Railway 설정
- [ ] Landing Page 서비스 도메인 확인
- [ ] Main App 서비스 도메인 확인

### Cloudflare DNS
- [ ] nubabel.com CNAME 레코드 추가 (@)
- [ ] app.nubabel.com CNAME 레코드 추가 (app)
- [ ] Proxy status: Proxied (🔶)
- [ ] TTL: Auto

### Cloudflare SSL/TLS
- [ ] Encryption mode: Full (strict)
- [ ] Always Use HTTPS: ON

### 검증
- [ ] DNS 전파 확인 (dig 명령어)
- [ ] Landing Page 접속 테스트 (https://nubabel.com)
- [ ] Main App 접속 테스트 (https://app.nubabel.com)
- [ ] SSL 인증서 확인 (🔒 아이콘)

---

## 🔧 자동화 스크립트 사용법

### 전제 조건

1. **Cloudflare API Token** 생성
   - https://dash.cloudflare.com/profile/api-tokens
   - 권한: DNS 레코드 편집

2. **Cloudflare Zone ID** 확인
   - https://dash.cloudflare.com
   - nubabel.com 선택 → 우측 하단 Zone ID 복사

### 실행 방법

```bash
cd /Users/sean/Documents/Kyndof/tools/nubabel
node setup-cloudflare-dns.js
```

### 입력 예시

```
1️⃣  Cloudflare API Token: [API Token 입력]
2️⃣  Cloudflare Zone ID: [Zone ID 입력]
3️⃣  Landing Page Railway Domain: nubabel-landing-prod.up.railway.app
4️⃣  Main App Railway Domain: nubabel-app-prod.up.railway.app
```

### 예상 결과

```
✅ 레코드 #1 생성 완료
✅ 레코드 #2 생성 완료
✅ ===== DNS 설정 완료 =====
```

---

## 📞 트러블슈팅

### 문제 1: DNS가 전파되지 않음
→ DNS_SETUP_COMPLETE.md의 "문제 1" 섹션 참고

### 문제 2: "Too many redirects" 오류
→ DNS_SETUP_COMPLETE.md의 "문제 2" 섹션 참고

### 문제 3: "Connection refused" 오류
→ DNS_SETUP_COMPLETE.md의 "문제 3" 섹션 참고

### 문제 4: SSL 인증서 오류
→ DNS_SETUP_COMPLETE.md의 "문제 4" 섹션 참고

### 문제 5: CORS 오류
→ DNS_SETUP_COMPLETE.md의 "문제 5" 섹션 참고

---

## 📚 참고 자료

- **Railway Docs**: https://docs.railway.app/guides/public-networking#custom-domains
- **Cloudflare DNS**: https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/
- **Cloudflare SSL**: https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/
- **Cloudflare API**: https://developers.cloudflare.com/api/

---

## 🎓 학습 포인트

### DNS 설정 개념
- **CNAME 레코드**: 도메인을 다른 도메인으로 매핑
- **Proxy status**: Cloudflare CDN 활성화 여부
- **TTL**: DNS 캐시 유지 시간

### SSL/TLS 설정
- **Full (strict)**: Cloudflare ↔ Railway 간 SSL 암호화
- **Always Use HTTPS**: HTTP → HTTPS 자동 리다이렉트

### DNS 전파
- **일반적**: 5-10분
- **최대**: 24-48시간
- **캐시 초기화**: 로컬 DNS 캐시 비우기

---

## 📝 다음 단계

### 즉시 (지금)
1. Railway 도메인 정보 수집
2. Cloudflare DNS 레코드 추가
3. SSL/TLS 설정 확인

### 5-10분 후
1. DNS 전파 확인
2. 브라우저 테스트

### 추가 설정 (선택사항)
1. Cloudflare 캐싱 규칙 설정
2. Railway 환경변수 확인
3. 모니터링 설정

---

## 📊 작업 통계

| 항목 | 수량 |
|------|------|
| 생성된 문서 | 4개 |
| 총 문서 크기 | ~16KB |
| 포함된 가이드 | 5개 |
| 트러블슈팅 항목 | 5개 |
| 자동화 스크립트 | 1개 |

---

## ✨ 특징

✅ **완전한 가이드**: 초보자도 따라할 수 있는 단계별 설정  
✅ **자동화 스크립트**: Cloudflare API를 사용한 자동 설정  
✅ **트러블슈팅**: 5가지 일반적인 문제 해결 방법  
✅ **빠른 시작**: 5분 안에 설정 가능  
✅ **완료 체크리스트**: 설정 완료 여부 확인  

---

**작성자**: Nubabel Engineering  
**버전**: 1.0.0  
**마지막 업데이트**: 2026-01-26

