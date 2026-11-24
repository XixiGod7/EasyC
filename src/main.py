# src/main.py

import os
import sys
from pathlib import Path

# 定义项目根目录
ROOT_DIR = Path(__file__).resolve().parent.parent

from utils.logger import LOG
from dotenv import load_dotenv
import gradio as gr

from backend.compiler.local_compiler_service import LocalCompilerService
from backend.exercise.exercise_service import ExerciseService
from backend.ai.feedback_service import AIFeedbackService
from frontend.tabs.compiler_tab import CompilerTab
from frontend.tabs.exercise_tab import ExerciseTab
from frontend.tabs.welcome_tab import WelcomeTab
from frontend.tabs.settings_tab import SettingsTab

# 加载环境变量
load_dotenv()

# 将 demo 设置为全局变量
compiler_css_path = str(ROOT_DIR / "src" / "frontend" / "static" / "css" / "compiler.css")
exercises_css_path = str(ROOT_DIR / "src" / "frontend" / "static" / "css" / "exercises.css")
welcome_css_path = str(ROOT_DIR / "src" / "frontend" / "static" / "css" / "welcome.css")
settings_css_path = str(ROOT_DIR / "src" / "frontend" / "static" / "css" / "settings.css")

theme = gr.themes.Origin(
    # primary_hue=gr.themes.Color(c100="#acbfe6", c200="#6688cc", c300="#3b5d8f", c400="#60a5fa", c50="#eff6ff", c500="#3b82f6", c600="#2563eb", c700="#1d4ed8", c800="#1e40af", c900="#1e3a8a", c950="#1d3660"),
    # primary_hue="blue",
    # secondary_hue="slate",
    primary_hue=gr.themes.Color(c100="#f1f5f9", c200="#cedef0", c300="#cbd5e1", c400="#6b9bd1", c50="#f8fafc", c500="#104c91", c600="#475569", c700="#334155", c800="#1e293b", c900="#0f172a", c950="#0a0f1e"),
    neutral_hue="gray",
).set(
    body_background_fill='*neutral_50',
    block_background_fill='white',
    form_gap_width='*spacing_sm',
    layout_gap='*spacing_sm',
    code_background_fill='*primary_50',
    button_primary_background_fill="*primary_400",
    button_primary_background_fill_hover='linear-gradient(to bottom right, *primary_400, *primary_200)',
    button_primary_border_color='white',
    button_primary_text_color='white',
)
    

with gr.Blocks(
    title="EasyC - C语言在线编程平台",
    css_paths=[compiler_css_path, exercises_css_path, welcome_css_path, settings_css_path],
    theme=theme,
    fill_height=True,
    fill_width=True,
) as demo:
        
        compiler_service = LocalCompilerService()
        feedback_service = AIFeedbackService()
        exercise_service = ExerciseService(compiler_service)

        WelcomeTab().create()
        ExerciseTab(exercise_service, compiler_service, feedback_service).create()
        CompilerTab(compiler_service, feedback_service).create()
        SettingsTab(feedback_service).create()



def main():
    LOG.info("Starting EasyC application")
    LOG.info("Launching EasyC application")
    demo.launch(
        server_name=os.getenv("GRADIO_SERVER_NAME", "127.0.0.1"),
        server_port=int(os.getenv("GRADIO_SERVER_PORT", "7860")),
        share=False,
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        LOG.exception(f"Application crashed: {e}")
        raise
