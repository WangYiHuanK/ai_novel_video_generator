from mlx_vlm import load, generate
from mlx_vlm.prompt_utils import apply_chat_template

model, processor = load("Jiunsong/supergemma4-26b-abliterated-multimodal-mlx-4bit")

config = model.config

prompt = apply_chat_template(
    processor, config, "小明去商店买文具，一支铅笔2元，一个笔记本5元，他买了3支铅笔和4个笔记本，给了收银员50元，收银员应该找给他多少钱？"
)
print("Prompt:", repr(prompt))

response = generate(model, processor, prompt=prompt, max_tokens=512)
print(response)