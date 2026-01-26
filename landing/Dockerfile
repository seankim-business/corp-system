FROM nginx:alpine

COPY index.html /usr/share/nginx/html/
COPY images/ /usr/share/nginx/html/images/
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Railway provides PORT env var (default to 80 for local)
ENV PORT=80
ENV NGINX_PORT=$PORT

EXPOSE $PORT

# Use envsubst to replace $PORT in nginx config, then start nginx
CMD ["sh", "-c", "envsubst '$$PORT' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
