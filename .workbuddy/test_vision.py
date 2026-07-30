import urllib.request, base64, json, sys

# 下载一张真实面料图
img_url = "https://placehold.co/300x300/1a3a5a/ffffff.png"
try:
    raw = urllib.request.urlopen(img_url, timeout=25).read()
    print("图片下载成功", len(raw), "字节")
except Exception as e:
    print("图片下载失败:", e)
    sys.exit(1)

b64 = base64.b64encode(raw).decode()
data_uri = f"data:image/jpeg;base64,{b64}"

body = {
    "model": "gpt-5.4",
    "messages": [{
        "role": "user",
        "content": [
            {"type": "text", "text": "识别这块面料的特征，严格返回JSON：{\"color\":\"主色\",\"texture\":\"纹理\",\"composition\":\"成分\",\"weight\":\"克重\",\"width\":\"门幅\",\"gloss\":\"光泽\"}。只返回JSON。"},
            {"type": "image_url", "image_url": {"url": data_uri}}
        ]
    }],
    "max_tokens": 120
}

req = urllib.request.Request(
    "https://token.86969678.xyz/v1/chat/completions",
    data=json.dumps(body).encode(),
    headers={
        "Authorization": "Bearer sk-efc14af3c857679d65b0120664f8da3bd2e245575a57117f32dc943d33dfd76c",
        "Content-Type": "application/json"
    }
)
try:
    resp = urllib.request.urlopen(req, timeout=90)
    print("HTTP", resp.status)
    print(resp.read().decode())
except urllib.error.HTTPError as e:
    print("HTTP错误", e.code)
    print(e.read().decode())
except Exception as e:
    print("请求失败:", e)
