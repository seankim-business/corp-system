# nubabel.com 문제 - 최종 해결 방안

## 문제 요약

- **app.nubabel.com**: ✅ 정상 작동 (백엔드 API 응답)
- **nubabel.com**: ❌ GoDaddy "곧 시작" 페이지 표시
- **inspiring-courage-production.up.railway.app**: ✅ 정상 작동 (올바른 랜딩 페이지)

## 근본 원인

Railway의 `inspiring-courage-production` 서비스가 **호스트 헤더에 따라 다른 콘텐츠를 서빙**하고 있습니다:

- `Host: inspiring-courage-production.up.railway.app` → ✅ Nubabel 랜딩 페이지
- `Host: nubabel.com` → ❌ GoDaddy 페이지

## 시도한 해결 방법 (모두 실패)

1. ✅ DNS 설정 변경 (CNAME → Railway) - 완료
2. ✅ Cloudflare 캐시 비우기 (여러 번) - 완료
3. ✅ Cloudflare Development Mode - 시도함
4. ✅ Cloudflare Workers 프록시 생성 - 작동 안 함
5. ✅ Cloudflare Page Rules 리다이렉트 - 작동 안 함
6. ❌ Railway 도메인 재설정 - 2FA로 인해 차단됨

## 유일한 해결책

**Railway 대시보드에서 수동으로 `nubabel.com` 커스텀 도메인을 재설정해야 합니다.**

### 단계별 가이드

1. https://railway.app/ 로그인
2. `inspiring-courage-production` 서비스 선택
3. Settings → Domains 이동
4. `nubabel.com` 찾기
5. `nubabel.com` **삭제**
6. 30초 대기
7. "Add Custom Domain" 클릭
8. `nubabel.com` 입력 후 추가
9. "Active" 상태가 될 때까지 대기 (1-2분)
10. 테스트: `curl https://nubabel.com/` → "Nubabel — Your AI Workforce" 표시되어야 함

### 검증 스크립트

```bash
./scripts/verify-railway-domain.sh
```

## 기술적 분석

### DNS 구성 (올바름)

```
nubabel.com → CNAME → inspiring-courage-production.up.railway.app
네임서버: Cloudflare (kianchau.ns.cloudflare.com, veronica.ns.cloudflare.com)
프록시: 활성화됨 (Cloudflare CDN 경유)
```

### Railway 라우팅 (문제)

```
GET / HTTP/1.1
Host: inspiring-courage-production.up.railway.app
→ 200 OK, Nubabel 랜딩 페이지

GET / HTTP/1.1
Host: nubabel.com
→ 200 OK, GoDaddy 페이지 (!!)
```

Railway가 `nubabel.com` 호스트명을 인식하지 못하거나 잘못된 배포로 라우팅하고 있습니다.

## 생성된 파일

- `cloudflare-worker-proxy.js` - Worker 프록시 (미사용)
- `fix-railway-domain.sh` - Railway CLI 자동화 스크립트
- `scripts/verify-railway-domain.sh` - 검증 스크립트
- 여러 문서 파일들

## 다음 단계

1. Railway에 로그인
2. 위 단계 따라 `nubabel.com` 도메인 재설정
3. 검증 스크립트 실행
4. 완료!

**예상 소요 시간**: 5-10분
