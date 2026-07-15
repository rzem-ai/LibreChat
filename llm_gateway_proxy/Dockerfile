FROM nginx:stable-alpine

RUN apk add --no-cache gettext

# Ensure the njs module exists in the base image; nginx will fail to start if it's missing.
RUN test -f /usr/lib/nginx/modules/ngx_http_js_module.so

# Custom nginx.conf loads the njs module (required at top level, outside http{})
# and imports the azure_proxy.js njs script for Azure AU/US path rewriting.
COPY nginx.conf /etc/nginx/nginx.conf
COPY azure_proxy.js /etc/nginx/azure_proxy.js
COPY proxy.conf /etc/nginx/templates/proxy.conf.template
COPY proxy.sh /usr/local/bin/proxy

RUN chmod +x /usr/local/bin/proxy

EXPOSE 8081

ENTRYPOINT ["/usr/local/bin/proxy"]

