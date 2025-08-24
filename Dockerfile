FROM node:18-alpine

WORKDIR /app

# تثبيت أدوات البناء المطلوبة لـ wrtc
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl

COPY package*.json ./

# تثبيت dependencies مع السماح ببناء native code
RUN npm install

COPY . .

EXPOSE 3001
CMD ["node", "monitorIndex.js"]