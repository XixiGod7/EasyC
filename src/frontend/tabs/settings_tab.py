# src/frontend/tabs/settings_tab.py

from utils.logger import LOG
import gradio as gr
from backend.ai.feedback_service import AIFeedbackService

class SettingsTab:
    def __init__(self, feedback_service: AIFeedbackService):
        self.feedback_service = feedback_service

    def _save_settings(self, api_key: str):
        """保存设置"""
        LOG.info("Saving AI settings")
        self.feedback_service.update_credentials(api_key)
        if not api_key:
            return gr.update(value="❌ 配置失败！请输入有效的 API Key")
        return gr.update(value="✅ 配置已成功保存！您现在可以使用 AI 分析功能了。")

    def create(self):
        with gr.Tab("设置 ⚙️"):
            with gr.Column():
                gr.Markdown("""
                    ## AI 功能配置
                    配置 API Key 后即可使用 AI 分析功能。
                    
                    ### 如何获取 API Key？
                    1. 访问 [DeepSeek API](https://platform.deepseek.com/)
                    2. 注册并登录账号
                    3. 在控制台中创建 API Key
                """)
                
                api_key_input = gr.Textbox(
                    label="DeepSeek API Key",
                    placeholder="请输入您的 API Key",
                    type="password",
                )

                save_button = gr.Button(
                    "保存配置",
                    variant="primary",
                    # elem_classes=["settings-button"],
                    elem_classes=["save-button"]
                )

                status_message = gr.Markdown(visible=True)

                save_button.click(
                    fn=self._save_settings,
                    inputs=[api_key_input],
                    outputs=[status_message]
                )
