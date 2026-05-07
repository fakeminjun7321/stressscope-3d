# StressScope Cloud Solver

StressScope can run without local solver binaries by sending a solver job to an HTTP API.

## Local mock API

```bash
npm run cloud:mock
```

Then set `Cloud API URL` in the app to:

```text
http://localhost:8787
```

The mock endpoint confirms that browser-to-cloud submission works. It does not perform real FEA.

## Real cloud deployment

A production cloud worker should expose:

```text
POST /api/solve
GET /health
```

The worker must install and run the actual tools:

```text
Gmsh -> volume mesh
CalculiX or Code_Aster -> static solve
PrusaSlicer/CuraEngine -> G-code/infill extraction
Result parser -> stress, displacement, safety factor, report
```

The browser downloads or submits a `stressscope.solver-job.v1` JSON package. That package includes model metadata, load case, print settings, solver settings, mesh quality, and acceptance targets.
