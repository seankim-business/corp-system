# 🚀 Railway + Cloudflare DNS 설정 완료 가이드

**작성일**: 2026-01-26  
**목표**: nubabel.com과 app.nubabel.com을 Railway 서비스에 연결

---

## 📋 목차

1. [Railway 도메인 정보 수집](#1-railway-도메인-정보-수집)
2. [Cloudflare DNS 설정](#2-cloudflare-dns-설정)
3. [SSL/TLS 설정](#3-ssltls-설정)
4. [DNS 전파 확인](#4-dns-전파-확인)
5. [브라우저 테스트](#5-브라우저-테스트)
6. [트러블슈팅](#6-트러블슈팅)

---

## 1. Railway 도메인 정보 수집

### 1-1. Railway 대시보드 접속

```
https://railway.app/dashboard
```

### 1-2. 프로젝트 선택

- **nubabel** 또는 **corp-system** 프로젝트 선택

### 1-3. Landing Page 서비스 도메인 확인

**경로**: Services → Landing → Settings → Domains

**확인 항목**:
- Railway Domain (형식: `xxx.up.railway.app`)

**예시**:
```
Railway Domain: nubabel-landing-prod.up.railway.app
```

**📝 기록**:
```
Landing Page Railway Domain: _________________________________
```

### 1-4. Main App 서비스 도메인 확인

**경로**: Services → App → Settings → Domains

**확인 항목**:
- Railway Domain

**예시**:
```
Railway Domain: nubabel-app-prod.up.railway.app
```

**📝 기록**:
```
Main App Railway Domain: _________________________________
```

---

## 2. Cloudflare DNS 설정

### 2-1. Cloudflare 대시보드 접속

```
https://dash.cloudflare.com
```

### 2-2. nubabel.com 도메인 선택

- 좌측 메뉴에서 **nubabel.com** 선택

### 2-3. DNS Records 페이지 접속

**경로**: DNS → Records

### 2-4. CNAME 레코드 추가

#### 레코드 #1: nubabel.com (Landing Page)

| 항목 | 값 |
|------|-----|
| **Type** | CNAME |
| **Name** | @ |
| **Target** | `[Landing Page Railway Domain]` |
| **Proxy status** | 🔶 Proxied |
| **TTL** | Auto |

**예시**:
```
Type: CNAME
Name: @
Target: nubabel-landing-prod.up.railway.app
Proxy: Proxied
TTL: Auto
```

**단계**:
1. **Add record** 클릭
2. Type: **CNAME** 선택
3. Name: **@** 입력
4. Target: **[Landing Railway Domain]** 입력
5. Proxy status: **🔶 Proxied** 선택
6. **Save** 클릭

#### 레코드 #2: app.nubabel.com (Main App)

| 항목 | 값 |
|------|-----|
| **Type** | CNAME |
| **Name** | app |
| **Target** | `[Main App Railway Domain]` |
| **Proxy status** | 🔶 Proxied |
| **TTL** | Auto |

**예시**:
```
Type: CNAME
Name: app
Target: nubabel-app-prod.up.railway.app
Proxy: Proxied
TTL: Auto
```

**단계**:
1. **Add record** 클릭
2. Type: **CNAME** 선택
3. Name: **app** 입력
4. Target: **[Main App Railway Domain]** 입력
5. Proxy status: **🔶 Proxied** 선택
6. **Save** 클릭

### 2-5. 변경사항 저장

- 각 레코드 추가 후 자동으로 저장됨
- 확인: DNS Records 페이지에서 두 레코드 모두 표시되는지 확인

---

## 3. SSL/TLS 설정

### 3-1. SSL/TLS 모드 설정

**경로**: SSL/TLS → Overview

**단계**:
1. **Encryption mode** 섹션 찾기
2. **Full (strict)** 선택
3. 저장됨 (자동)

**설명**:
- **Full (strict)**: Cloudflare ↔ Railway 간 SSL 암호화
- Railway는 자동으로 Let's Encrypt 인증서 발급

### 3-2. Always Use HTTPS 활성화

**경로**: SSL/TLS → Edge Certificates

**단계**:
1. **Always Use HTTPS** 토글 찾기
2. **ON** 설정
3. 저장됨 (자동)

**효과**:
- 모든 HTTP 요청이 HTTPS로 자동 리다이렉트됨

---

## 4. DNS 전파 확인

### 4-1. 터미널에서 DNS 확인

```bash
# nubabel.com DNS 확인
dig nubabel.com

# app.nubabel.com DNS 확인
dig app.nubabel.com
```

### 4-2. 예상 결과

```
nubabel.com.        300     IN      CNAME   nubabel-landing-prod.up.railway.app.
app.nubabel.com.    300     IN      CNAME   nubabel-app-prod.up.railway.app.
```

### 4-3. 전파 시간

- **일반적**: 5-10분
- **최대**: 24-48시간

### 4-4. DNS 캐시 초기화 (필요시)

**macOS**:
```bash
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
```

**Windows**:
```cmd
ipconfig /flushdns
```

**Linux**:
```bash
sudo systemd-resolve --flush-caches
```

---

## 5. 브라우저 테스트

### 5-1. Landing Page 테스트

**URL**: https://nubabel.com

**확인 항목**:
- [ ] 페이지 로딩 성공
- [ ] 🔒 자물쇠 아이콘 표시 (SSL 인증서)
- [ ] 정적 HTML 콘텐츠 표시

### 5-2. Main App 테스트

**URL**: https://app.nubabel.com

**확인 항목**:
- [ ] 페이지 로딩 성공
- [ ] 🔒 자물쇠 아이콘 표시
- [ ] React 앱 로딩
- [ ] Google OAuth 로그인 버튼 표시

### 5-3. SSL 인증서 확인

**단계**:
1. 브라우저 주소창의 🔒 아이콘 클릭
2. **인증서 정보** 확인
3. **발급자**: Cloudflare 또는 Let's Encrypt
4. **유효 기간**: 현재 날짜 포함 확인

---

## 6. 트러블슈팅

### 문제 1: DNS가 전파되지 않음

**증상**: `dig nubabel.com`에서 CNAME 레코드가 표시되지 않음

**해결책**:
1. Cloudflare DNS Records 페이지에서 레코드 확인
2. DNS 캐시 초기화 (위 참고)
3. 24-48시간 대기

### 문제 2: "Too many redirects" 오류

**증상**: https://nubabel.com 접속 시 무한 리다이렉트

**원인**: SSL/TLS 모드가 Flexible일 때 발생

**해결책**:
1. Cloudflare → **SSL/TLS** → **Full (strict)** 선택
2. Railway에서 HTTPS 활성화 확인

### 문제 3: "Connection refused" 오류

**증상**: 도메인 접속 시 연결 거부

**원인**: Railway 서비스가 실행 중이지 않음

**해결책**:
1. Railway 대시보드에서 서비스 상태 확인
2. 서비스가 "Running" 상태인지 확인
3. 로그에서 오류 메시지 확인

### 문제 4: SSL 인증서 오류

**증상**: "SSL certificate problem" 오류

**원인**: Cloudflare와 Railway 간 SSL 설정 불일치

**해결책**:
1. Cloudflare SSL/TLS → **Full (strict)** 확인
2. Railway에서 자동 SSL 인증서 발급 확인
3. 5-10분 대기 후 재시도

### 문제 5: CORS 오류

**증상**: 브라우저 콘솔에서 CORS 오류

**원인**: Railway 환경변수 설정 불일치

**해결책**:
1. Railway 대시보드 → App 서비스 → Variables
2. 다음 환경변수 확인:
   ```
   BASE_URL=https://app.nubabel.com
   CORS_ORIGIN=https://app.nubabel.com
   ```
3. 변경 후 서비스 재배포

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

## 📞 지원

**문제 발생 시**:
1. 위 트러블슈팅 섹션 참고
2. Railway 로그 확인: https://railway.app/dashboard
3. Cloudflare 상태 확인: https://dash.cloudflare.com

**참고 문서**:
- [Railway Docs](https://docs.railway.app/guides/public-networking#custom-domains)
- [Cloudflare DNS](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/)
- [Cloudflare SSL](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/)

---

**작성자**: Nubabel Engineering  
**버전**: 1.0.0  
**마지막 업데이트**: 2026-01-26

