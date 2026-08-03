import os

from openai import OpenAI


api_key = os.environ.get("ARK_API_KEY")
if not api_key:
    raise RuntimeError("缺少环境变量 ARK_API_KEY")

client = OpenAI(
    base_url=os.environ.get(
        "SEEDREAM_BASE_URL",
        "https://ark.cn-beijing.volces.com/api/v3",
    ),
    api_key=api_key,
)

response = client.images.generate(
    model=os.environ.get(
        "SEEDREAM_MODEL",
        "doubao-seedream-5-0-pro-260628",
    ),
    prompt=(
        "一条完整的蓝色小鱼，主体居中，保留自然细节，"
        "纯透明背景，PNG素材，无文字，无水印"
    ),
    size="2K",
    response_format="b64_json",
    extra_body={
        "watermark": False,
    },
)

image_base64 = response.data[0].b64_json
if not image_base64:
    raise RuntimeError("Seedream API 未返回 Base64 图片")

print(f"Seedream API 接入成功，收到 {len(image_base64)} 个 Base64 字符")
