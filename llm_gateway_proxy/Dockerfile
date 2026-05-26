FROM nginx:stable-alpine

RUN apk add --no-cache gettext

COPY proxy.conf /etc/nginx/templates/proxy.conf.template
COPY proxy.sh /usr/local/bin/proxy

RUN chmod +x /usr/local/bin/proxy

EXPOSE 8081

ENTRYPOINT ["/usr/local/bin/proxy"]

