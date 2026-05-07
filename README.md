# StressScope 3D

Fusion/3MF/STL/OBJ/GLB 모델을 브라우저에서 불러와 3D 프린팅 구조물의 하중 집중 가능 지점을 빠르게 확인하는 웹앱입니다.

## What It Does

- 3D 모델 업로드와 하중/고정 조건 설정
- 메시 기반 예비 응력 히트맵
- 메시 품질 검사
- 파괴하중 역산과 슬라이서/인필 보정
- 접촉/볼트/접착 간이 체크
- Cloud/Windows CAE solver job JSON 생성

## Public App

This repo is configured for GitHub Pages at:

```text
https://fakeminjun7321.github.io/stressscope-3d/
```

## Stress Test Model

Download this complex OBJ test file and upload it in the app:

```text
https://fakeminjun7321.github.io/stressscope-3d/test-assets/stressscope-mega-architecture.obj
```

It contains a multi-tower architectural structure with skybridges, trusses, arches, cantilevers, columns, and stairs.

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Regenerate the stress test model:

```bash
npm run generate:test-model
```

## Optional Cloud Solver API

The static web app can submit solver jobs to an HTTP API. A mock endpoint is included:

```bash
npm run cloud:mock
```

Set `Cloud API URL` in the app to:

```text
http://localhost:8787
```

For real FEA, deploy a cloud worker with Gmsh plus CalculiX or Code_Aster and expose `POST /api/solve`.
