"""
Token成本跟踪模块 - 用于跟踪项目中的token使用情况和成本

该模块提供了全局的token使用统计和成本跟踪功能，可以生成各种格式的报告。
"""

import os
import time
from pathlib import Path
from typing import Dict, Any, Optional, List
import logging
import json

from .token_counter import token_stats

logger = logging.getLogger(__name__)

class TokenCostTracker:
    """Token成本跟踪器"""
    
    def __init__(self, report_dir: str = None):
        """
        初始化Token成本跟踪器
        
        Args:
            report_dir: 报告保存目录，默认为项目根目录下的token_reports
        """
        # 设置报告保存目录
        if report_dir:
            self.report_dir = Path(report_dir)
        else:
            # 默认在项目根目录下创建token_reports目录
            self.report_dir = Path(os.getcwd()) / "token_reports"
            
        # 确保目录存在
        os.makedirs(self.report_dir, exist_ok=True)
        
        # 记录启动时间
        self.start_time = time.time()
        self.start_datetime = time.strftime("%Y-%m-%d %H:%M:%S")
        
        logger.info(f"Token成本跟踪器已初始化，报告将保存到: {self.report_dir}")
    
    def get_summary(self) -> Dict[str, Any]:
        """
        获取当前使用统计摘要
        
        Returns:
            统计摘要字典
        """
        summary = token_stats.get_summary()
        
        # 添加运行时间信息
        current_time = time.time()
        elapsed_seconds = current_time - self.start_time
        
        # 格式化运行时间
        hours, remainder = divmod(elapsed_seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        elapsed_formatted = f"{int(hours)}小时{int(minutes)}分钟{int(seconds)}秒"
        
        summary["tracking_info"] = {
            "start_time": self.start_datetime,
            "current_time": time.strftime("%Y-%m-%d %H:%M:%S"),
            "elapsed_seconds": elapsed_seconds,
            "elapsed_formatted": elapsed_formatted
        }
        
        return summary
    
    def generate_report(self, format: str = "all") -> Dict[str, str]:
        """
        生成成本报告
        
        Args:
            format: 报告格式，可选 "json", "csv", "markdown", "all"
            
        Returns:
            报告文件路径字典
        """
        # 生成报告文件名（包含时间戳）
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        report_paths = {}
        
        if format == "json" or format == "all":
            file_path = self.report_dir / f"token_report_{timestamp}.json"
            token_stats.export_report(format="json", file_path=str(file_path))
            report_paths["json"] = str(file_path)
            
        if format == "csv" or format == "all":
            file_path = self.report_dir / f"token_report_{timestamp}.csv"
            token_stats.export_report(format="csv", file_path=str(file_path))
            report_paths["csv"] = str(file_path)
            
        if format == "markdown" or format == "all":
            file_path = self.report_dir / f"token_report_{timestamp}.md"
            token_stats.export_report(format="markdown", file_path=str(file_path))
            report_paths["markdown"] = str(file_path)
        
        # 生成摘要文件
        summary_path = self.report_dir / f"token_summary_{timestamp}.json"
        with open(summary_path, 'w', encoding='utf-8') as f:
            json.dump(self.get_summary(), f, indent=2, ensure_ascii=False)
        report_paths["summary"] = str(summary_path)
        
        logger.info(f"成本报告已生成: {report_paths}")
        return report_paths
    
    def print_current_stats(self):
        """打印当前统计信息到控制台"""
        summary = self.get_summary()
        
        print("\n" + "=" * 50)
        print("Token使用统计摘要")
        print("=" * 50)
        
        # 运行时间信息
        tracking_info = summary["tracking_info"]
        print(f"开始时间: {tracking_info['start_time']}")
        print(f"当前时间: {tracking_info['current_time']}")
        print(f"运行时长: {tracking_info['elapsed_formatted']}")
        print("-" * 50)
        
        # Token使用情况
        total_usage = summary["total_usage"]
        print(f"总输入Token: {total_usage.prompt_tokens}")
        print(f"总输出Token: {total_usage.completion_tokens}")
        print(f"总Token: {total_usage.total_tokens}")
        print(f"总成本: ${summary['total_cost']:.6f} USD")
        print("-" * 50)
        
        # 模型使用情况
        print("模型使用情况:")
        model_usage = summary["model_usage"]
        for model, usage in model_usage.items():
            print(f"  {model}:")
            print(f"    输入Token: {usage.prompt_tokens}")
            print(f"    输出Token: {usage.completion_tokens}")
            print(f"    总Token: {usage.total_tokens}")
        print("=" * 50)


# 创建全局跟踪器实例
token_cost_tracker = TokenCostTracker()
