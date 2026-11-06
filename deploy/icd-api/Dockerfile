# WHO's ICD-11 API with its classification data baked in, so diagnosis lookup works on the clinic
# machine with no internet.
#
# WHO's image ships without the ICD-11 data: it downloads it the first time the container starts.
# The clinic machine cannot do that, so this build starts the API once — here, on the build
# machine, which has internet — waits until a search answers, and keeps the downloaded data and
# search index in the image.
#
# Build (deploy/build-clinic-image.sh does this):
#   docker build -t epoch-icd-api:2026-01 deploy/icd-api
#
# To move to a new ICD-11 release (WHO publishes one each January): pull whoicd/icd-api, put its
# new digest below, set ICD_RELEASE, and set the same release in ICD11_RELEASE for the app
# (deploy/clinic/docker-compose.yml). Codes already saved on consultations are not changed.

# Pinned by digest so every build bakes in the same API version.
FROM whoicd/icd-api@sha256:1b77eb6dc43e0c65a12e9e9340ad178493c93488e728d0d936507cc57ada1b7c

ARG ICD_RELEASE=2026-01

# acceptLicense: ICD-11 is published by WHO under CC BY-ND 3.0 IGO; the API refuses to start
# without this. saveAnalytics=false: search text would be diagnosis wording typed during
# consultations, and it must not be sent anywhere.
ENV acceptLicense=true \
    saveAnalytics=false \
    include=${ICD_RELEASE}_en \
    ICD_RELEASE=${ICD_RELEASE}

COPY start.sh /usr/local/bin/icd-api-start
RUN chmod +x /usr/local/bin/icd-api-start

# Download the release and build the search index now. Only a successful search proves the index
# is ready, so wait for one (up to 15 minutes), then remove what the warm-up run left behind.
RUN set -eu; \
    icd-api-start > /tmp/warmup.log 2>&1 & pid=$!; \
    tries=0; \
    until wget -q -O /dev/null \
        --header 'API-Version: v2' --header 'Accept: application/json' --header 'Accept-Language: en' \
        "http://127.0.0.1/icd/release/11/${ICD_RELEASE}/mms/search?q=asthma"; do \
      tries=$((tries + 1)); \
      if [ "$tries" -gt 180 ] || ! kill -0 "$pid" 2>/dev/null; then \
        echo "ICD-API did not become ready:" >&2; cat /tmp/warmup.log >&2; exit 1; \
      fi; \
      sleep 5; \
    done; \
    kill "$pid"; wait "$pid" || true; \
    rm -rf /tmp/warmup.log /tmp/clr-debug-pipe-* /tmp/dotnet-diagnostic-* \
           /usr/share/icdapi/logapi*.txt /usr/share/icdapi/analytics /root/.aspnet

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD wget -q -O /dev/null --header 'API-Version: v2' --header 'Accept: application/json' --header 'Accept-Language: en' \
      "http://127.0.0.1/icd/release/11/${ICD_RELEASE}/mms/search?q=asthma" || exit 1

EXPOSE 80
ENTRYPOINT ["icd-api-start"]
