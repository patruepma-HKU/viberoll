FROM node:20-bookworm-slim

# ffmpeg + fonts (DejaVu has full cyrillic; symlinked to the path used by the app)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /usr/share/fonts/truetype/google-fonts \
    && ln -sf /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf \
              /usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start"]
