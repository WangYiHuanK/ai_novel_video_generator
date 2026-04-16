#!/usr/bin/env python3
"""
Mify AI API 测试脚本
测试 xiaomi/mimo-v2-flash 模型的调用
"""

import os
import asyncio
import aiohttp
import json
from typing import Optional


class MifyAPITester:
    """Mify AI API 测试器"""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("MIFY_API_KEY")
        self.base_url = "http://model.mify.ai.srv/v1/chat/completions"

        if not self.api_key:
            raise ValueError("MIFY_API_KEY 环境变量未设置")

    async def test_chat_completion(
        self,
        model: str = "xiaomi/mimo-v2-flash",
        messages: Optional[list] = None,
        request_id: str = "1234"
    ) -> dict:
        """
        测试聊天补全接口

        Args:
            model: 模型名称
            messages: 消息列表
            request_id: 请求ID

        Returns:
            API 响应结果
        """
        if messages is None:
            messages = [
                {
                    "role": "system",
                    "content": "You are a helpful assistant."
                },
                {
                    "role": "user",
                    "content": "please introduce yourself"
                }
            ]

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "X-Model-Request-Id": request_id,
            "Content-Type": "application/json"
        }

        payload = {
            "model": model,
            "messages": messages
        }

        print(f"🚀 发送请求到: {self.base_url}")
        print(f"📝 模型: {model}")
        print(f"💬 消息数量: {len(messages)}")
        print("-" * 60)

        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    self.base_url,
                    headers=headers,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    status = response.status
                    result = await response.json()

                    print(f"✅ 状态码: {status}")
                    print(f"📦 响应内容:")
                    print(json.dumps(result, indent=2, ensure_ascii=False))

                    return result

            except aiohttp.ClientError as e:
                print(f"❌ 请求失败: {e}")
                raise
            except asyncio.TimeoutError:
                print(f"⏱️ 请求超时")
                raise


async def main():
    """主测试函数"""
    print("=" * 60)
    print("Mify AI API 测试")
    print("=" * 60)
    print()

    try:
        # 创建测试器
        tester = MifyAPITester()

        # 测试1: 基础对话
        print("【测试 1】基础对话测试")
        await tester.test_chat_completion()
        print()

        # 测试2: 自定义消息
        print("【测试 2】自定义消息测试")
        custom_messages = [
            {
                "role": "system",
                "content": "你是一个专业的小说写作助手。"
            },
            {
                "role": "user",
                "content": "请帮我写一个科幻小说的开头，主题是时间旅行。"
            }
        ]
        await tester.test_chat_completion(
            messages=custom_messages,
            request_id="test-custom-001"
        )
        print()

        print("=" * 60)
        print("✅ 所有测试完成")
        print("=" * 60)

    except ValueError as e:
        print(f"❌ 配置错误: {e}")
        print("请设置 MIFY_API_KEY 环境变量")
        print("示例: export MIFY_API_KEY='your-api-key'")
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
