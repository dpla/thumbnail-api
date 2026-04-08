# Deploying the Thumbnail API

The thumbnail API is a Node.js/TypeScript service running on AWS ECS Fargate (6 tasks, blue/green deployment via CodeDeploy). It serves thumbnail images for all ~50M items on dp.la via `thumb.dp.la`.

---

## Preferred: deploy both API services together

When deploying both the thumbnail API and the DPLA API in the same maintenance window, use the combined script to run everything in parallel. This produces one impact window instead of two:

```bash
~/bin/deploy-api-services          # deploy both
~/bin/deploy-api-services thumb    # thumbnail-api only
~/bin/deploy-api-services api      # api only
```

The script lives at `~/bin/deploy-api-services` on the operator's local machine. If it's missing, ask in #tech or check with the person who last deployed.

---

## Manual deploy (this service only)

Deployment is a **two-phase process**. The pipeline webhook is intentionally disabled — every deployment must be triggered manually.

### Phase 1: Build the Docker image (GitHub Actions)

Dispatch the `ecr.yml` workflow ("push to ecr: production") manually:

```bash
gh api --method POST \
  /repos/dpla/thumbnail-api/actions/workflows/ecr.yml/dispatches \
  -f ref=main
```

Or go to **Actions → push to ecr: production → Run workflow** in the GitHub UI.

This runs `npm ci`, builds TypeScript, uploads source maps to Sentry, then builds a multi-arch Docker image and pushes it to ECR tagged as `latest`, the branch name, and the commit SHA. **This takes approximately 5–10 minutes.**

Verify the new image after the action completes:

```bash
aws ecr describe-images \
  --repository-name thumbnail-api \
  --image-ids imageTag=latest \
  --region us-east-1 \
  --query 'imageDetails[0].imagePushedAt' \
  --output text
```

The timestamp should match the current deployment. If you need to confirm the exact image (e.g. if another workflow may have updated `latest` concurrently), use the commit SHA tag from the workflow run output instead of `imageTag=latest`.

### Phase 2: Run the CodePipeline

```bash
aws codepipeline start-pipeline-execution \
  --name thumbnail-api-pipeline \
  --region us-east-1
```

| Stage | What it does | Typical duration |
|---|---|---|
| **Source** | Pulls latest `main` from GitHub | ~10 seconds |
| **Build** | Generates `taskdef.json` and `appspec.yaml` | ~1 minute |
| **Production** | Blue/green ECS deploy (CodeDeploy `ECSAllAtOnce`) | ~7 minutes |

**Total typical duration: ~10–15 minutes.**

Monitor pipeline progress:

```bash
aws codepipeline get-pipeline-state \
  --name thumbnail-api-pipeline \
  --region us-east-1 \
  --query 'stageStates[*].{stage:stageName,status:latestExecution.status}'
```

---

## Important characteristics

### Blue/green deployment with automatic rollback

Uses **blue/green deployment** via AWS CodeDeploy (`ECSAllAtOnce`). New "green" tasks are created, health-checked, then receive 100% of traffic atomically. Blue tasks are terminated 5 minutes later. Automatic rollback is enabled on deployment failure. *(Verified in AWS console 2026-04-07; these settings are managed in AWS, not enforced by `appspec_template.yaml`.)*

### Slow-start on ALB target groups

Both `thumbnail-api-tg-blue` and `thumbnail-api-tg-green` have **90-second slow start** enabled. New tasks ramp to full traffic share over 90 seconds, preventing cold-start errors on the first requests after a deploy. *(Verified in AWS console 2026-04-07.)*

---

## Post-deploy health check

```bash
curl -sf -o /dev/null -w "HTTP %{http_code}\n" \
  "https://thumb.dp.la/thumb/f293d15b0515ac8a5478cbd9c02af79c"
```

Expect HTTP 200. Failures return 404 (item not found or upstream 404/410), 502 (other upstream error), or 400 (malformed ID). The service follows upstream redirects internally — 302 is never returned to clients.

---

## Infrastructure reference

| Resource | Value |
|---|---|
| GitHub repo | `dpla/thumbnail-api` |
| GH Actions workflow | `ecr.yml` — "push to ecr: production" |
| ECR repo | `283408157088.dkr.ecr.us-east-1.amazonaws.com/thumbnail-api` |
| CodePipeline | `thumbnail-api-pipeline` |
| CodeBuild project | `thumbnail-api-codebuild` |
| CodeDeploy app / group | `thumbnail-api-deployment` / `thumbnail-api-deployment-group` |
| ECS cluster / service | `thumbnail-api` / `thumbnail-api` |
| Task count | 6 |
| ALB target groups | `thumbnail-api-tg-blue`, `thumbnail-api-tg-green` (90s slow start, verified 2026-04-07) |
| Deployment type | Blue/green (`ECSAllAtOnce`) — auto-rollback on failure (verified 2026-04-07) |
| AWS region | `us-east-1` |
