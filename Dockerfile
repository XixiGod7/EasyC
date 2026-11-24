FROM python:3.10-slim-bookworm

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 easyc \
    && mkdir -p /app/logs /tmp/compile \
    && chown easyc:easyc /app/logs /tmp/compile

# 先复制 requirements.txt
COPY requirements.txt .

# 安装 Python 依赖
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src
COPY prompts ./prompts

# 环境变量设置
ENV PYTHONPATH=/app/src \
    PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    GRADIO_SERVER_NAME=0.0.0.0 \
    GRADIO_SERVER_PORT=7860 \
    GRADIO_ANALYTICS_ENABLED=False

USER easyc

EXPOSE 7860

CMD ["python", "src/main.py"]
