# 配置文件备份说明

本目录包含项目的敏感配置文件备份,这些文件在 `.gitignore` 中被忽略,不会提交到版本控制系统。

## 配置文件列表

### 1. conf.yaml
**路径**: `Open-LLM-VTuber/conf.yaml`
**说明**: 项目主配置文件,包含:
- ASR (语音识别) 配置
- TTS (语音合成) 配置
- LLM (大语言模型) 配置
- 角色设置
- API密钥等敏感信息

### 2. docker-compose.yml
**路径**: `Open-LLM-VTuber/docker-compose.yml`
**说明**: Docker容器编排配置文件,定义服务、端口、环境变量等

### 3. google-tts-credentials.json
**路径**: `Open-LLM-VTuber/google-tts-credentials.json`
**说明**: Google Cloud Text-to-Speech API凭证文件,包含服务账号密钥

### 4. .env
**路径**: 项目根目录 `.env`
**说明**: 环境变量配置文件,可能包含:
- API密钥
- 数据库连接信息
- 其他敏感配置

### 5. .env.docker
**路径**: 项目根目录 `.env.docker`
**说明**: Docker环境专用的环境变量配置文件

## 使用说明

1. **新环境部署时**: 将这些文件复制到对应位置
2. **配置更新后**: 记得同步更新此目录中的备份文件
3. **安全提醒**: 此目录应当被 `.gitignore` 忽略,确保不会提交到公开仓库

## 重要提示

⚠️ **警告**: 这些文件包含敏感信息(API密钥、凭证等),请勿:
- 提交到公开的版本控制系统
- 分享给未授权人员
- 在不安全的渠道传输

## 更新日期

最后更新: 2025-10-17