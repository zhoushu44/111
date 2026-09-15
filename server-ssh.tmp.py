# 临时脚本：对比服务器 LabelPrint.tsx 与 git 历史版本
import paramiko

def run(c, cmd, t=120):
    _, out, err = c.exec_command(cmd, timeout=t)
    o = out.read().decode('utf-8', 'replace').strip()
    e = err.read().decode('utf-8', 'replace').strip()
    return o + (f'\n[stderr] {e}' if e else '')

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('192.6.121.16', 22, 'root', '6Qz6ao0T1zvL', timeout=15)
# 服务器现有文件的 md5、大小、时间
print(run(c, 'md5sum /root/erp/src/pages/LabelPrint.tsx; ls -la /root/erp/src/pages/LabelPrint.tsx'))
# 是否有备份
print(run(c, 'ls -la /root/erp/src/pages/ | grep -i label; ls -la /root/erp/*.tar.gz 2>/dev/null | head'))
c.close()
