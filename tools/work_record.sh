#!/bin/sh

# 引数チェック
if [ $# != 3 ]; then
  echo "Usage: $0 <氏名> <日付(例: 20190101)> <ログファイルパス>"
  exit
fi

name=$1
date=$2
log_filepath=$3

# 入力チェック
if [ ${#date} != 8 ]; then
  echo  "Error: 日付は8文字で指定してください(例: 20190101)。"
  exit
fi

# 日付を年月日に分割する
yaer=${date:0:4}
month=${date:4:2}
day=${date:6:2}

# 日付の範囲のログを抽出する
extraction_log_by_date=`awk -F , '"'${yaer}'-'${month}'-'${day}'T00:00:00" < $1 && $1 <= "'${yaer}'-'${month}'-'${day}'T23:59:59"' $log_filepath`

# 業務記録（一日）を抽出
record=`echo "${extraction_log_by_date}" | grep "${name}" | awk -F , -v 'OFS=,' '{ print $1,$3,$4 }'`

# 氏名からuserIDを特定する
userID=`grep "${name}" ${log_filepath} | tail -n1 | awk -F , '{ print $8 }'`

# おおよその始業時刻を抽出
opening_record=`echo "${extraction_log_by_date}" | grep -e ${userID} -e '"-","-","-"' | head -n1 | awk -F , '{ print $1 }'`

# おおよその最終業務時刻を抽出
last_record=`echo "${extraction_log_by_date}" | grep -e ${userID} -e '"-","-","-"' | tail -n1 | awk -F , '{ print $1 }'`

# 指定した日付のデータが存在するかどうか
  echo "========== ${name}さん ${yaer}年${month}月${day}日の業務記録 =========="
if [ -n "$record" -a -n "$last_record" ]; then
  echo "${record}"
  echo
  echo "本日の業務時間(おおよそ): ${opening_record} ～ ${last_record}"
else
  echo "本日の業務記録はありません"
fi
