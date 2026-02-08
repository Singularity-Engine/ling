#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
预设音频生成脚本
用于生成常用的音频文件，减少实时TTS调用开支
"""

import os
import sys
import asyncio
import yaml
from pathlib import Path
from typing import Dict, List
from dotenv import load_dotenv

# 添加项目路径到Python路径
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir / "src"))

# 导入项目中的TTS模块
from open_llm_vtuber.tts.tts_factory import TTSFactory
from open_llm_vtuber.config_manager.utils import read_yaml, validate_config

# 加载环境变量
load_dotenv()

class PresetAudioGenerator:
    def __init__(self, config_path: str = "conf.yaml"):
        """初始化音频生成器"""
        self.config_path = config_path
        self.audio_dir = Path("audio/presets")
        self.audio_dir.mkdir(parents=True, exist_ok=True)

        # 使用项目的配置加载器
        config_data = read_yaml(config_path)
        self.config = validate_config(config_data)

        # 获取TTS配置
        self.tts_config = self.config.character_config.tts_config
        self.tts_model = self.tts_config.tts_model

        # 创建TTS引擎
        # 将 Pydantic 模型转为字典
        tts_config_dict = self.tts_config.model_dump() if hasattr(self.tts_config, 'model_dump') else dict(self.tts_config)

        # 获取特定TTS模型的配置参数
        model_specific_config = tts_config_dict.get(self.tts_model, {})

        self.tts_engine = TTSFactory.get_tts_engine(
            engine_type=self.tts_model,
            **model_specific_config
        )

    def get_preset_texts(self) -> Dict[str, List[str]]:
        """定义需要预生成的音频文本 - 基于实际代码中的文本"""
        return {
            "greeting": [
                "Tch... It's you again, how boring. [angry] Talking to someone like you is simply a waste of my time.",
                "Hmph, you're here... [shy] Whatever, since you're here just speak up, such a hassle.",
                "It's you... [blush] I-I wasn't waiting for you! I just happened to be free.",
                "You're here... [shy] Well, I... I'm not worried about you, just asking casually.",
                "You're here~ [happy] I was just... okay, I did miss you a little.",
                "Darling! [happy] You're finally here, I missed you so much~ Don't leave me alone for so long again!",
                "Master! [blush] I've been waiting for you... Without you by my side, I can't do anything~",
                "你好，我是灵[wink]，很高兴认识你！你今天想聊些什么呢"
            ],
            "insufficient_credits": [
                "Sorry, you don't have enough credits to start a conversation. [sad] Please recharge your credits first."
            ],
            "login_required": [
                "Please log in first to start a conversation with me. [shy]"
            ]
        }

    async def generate_audio_using_project_tts(self, text: str, filename: str) -> bool:
        """使用项目中的TTS引擎生成音频"""
        try:
            # 清理文本中的表情标签
            clean_text = text
            for emotion in ['[happy]', '[sad]', '[shy]', '[angry]', '[wink]', '[blush]']:
                clean_text = clean_text.replace(emotion, '')
            clean_text = clean_text.strip()

            if not clean_text:
                print(f"跳过空文本: {filename}")
                return False

            print(f"使用{self.tts_model}生成音频: {clean_text[:50]}...")

            # 使用项目的TTS引擎生成音频
            audio_file_path = await self.tts_engine.async_generate_audio(
                text=clean_text,
                file_name_no_ext=Path(filename).stem
            )

            if audio_file_path and os.path.exists(audio_file_path):
                # 将生成的文件移动到预设音频目录
                target_path = self.audio_dir / filename

                # 如果目标文件已存在，先删除
                if target_path.exists():
                    target_path.unlink()

                # 移动文件
                import shutil
                shutil.move(audio_file_path, target_path)

                # 检查文件大小
                file_size = target_path.stat().st_size
                if file_size < 100:
                    print(f"警告: 生成的音频文件很小 ({file_size} 字节): {filename}")
                    return False

                print(f"生成成功: {filename} ({file_size} 字节)")
                return True
            else:
                print(f"TTS引擎未返回有效文件路径: {filename}")
                return False

        except Exception as e:
            print(f"生成失败: {filename} - {e}")
            return False

    async def generate_all_audio(self):
        """生成所有预设音频文件"""
        preset_texts = self.get_preset_texts()

        print(f"开始生成预设音频文件...")
        print(f"输出目录: {self.audio_dir.absolute()}")
        print(f"使用TTS模型: {self.tts_model}")
        print("-" * 50)

        total_success = 0
        total_files = 0

        for category, texts in preset_texts.items():
            print(f"\n生成 {category} 音频:")

            for i, text in enumerate(texts, 1):
                filename = f"{category}_{i}.mp3"
                total_files += 1

                # 使用项目的TTS引擎生成音频
                success = await self.generate_audio_using_project_tts(text, filename)

                if success:
                    total_success += 1

                # 避免API限流
                await asyncio.sleep(1)

        print("-" * 50)
        print(f"生成完成: {total_success}/{total_files} 个文件")

        if total_success > 0:
            print(f"\n生成的文件列表:")
            for file in sorted(self.audio_dir.glob("*.mp3")):
                size_kb = file.stat().st_size / 1024
                print(f"   {file.name} ({size_kb:.1f} KB)")

async def main():
    """主函数"""
    generator = PresetAudioGenerator()
    await generator.generate_all_audio()

if __name__ == "__main__":
    asyncio.run(main())