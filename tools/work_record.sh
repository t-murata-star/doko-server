#!/bin/sh

# 2つの日付の差分秒数を返す
# Usage: dateDiff 2019-11-01T11:00:00+09:00 2019-11-01T12:30:25+09:00
dateDiff () {
  START=`date -d "$1" +%s`
  FINISH=`date -d "$2" +%s`
  DIFF=$(( FINISH - START ))
  echo $DIFF
}

# 一日の離席時間の合計(秒)を計算する
# Usage: calcLeavingTime "$record"
# $recordは文字列。1行ごとにループ処理を行う
calcLeavingTime () {
  LEAVING_TIME_S_SUM=0
  TEMP_LEAVING_TIME_CALC_FLAG=false
  IFS=','

  while read line ; do
      set -- $line

      if [ $3 == '"在席 (離席中)"' -a "${TEMP_LEAVING_TIME_CALC_FLAG}" == "false" ]; then
        TEMP_LEAVING_TIME_FROM=$1
        TEMP_LEAVING_TIME_CALC_FLAG=true
        continue
      fi

      if [ $3 != '"在席 (離席中)"' -a "${TEMP_LEAVING_TIME_CALC_FLAG}" == "true" ]; then
        TEMP_LEAVING_TIME_TO=$1
        TEMP_LEAVING_TIME_CALC_FLAG=false
        # echo TO ' ' $1 $3 $TEMP_LEAVING_TIME_FROM $TEMP_LEAVING_TIME_TO
        date_diff=$(dateDiff $TEMP_LEAVING_TIME_FROM $TEMP_LEAVING_TIME_TO)
        LEAVING_TIME_S_SUM=$((LEAVING_TIME_S_SUM+date_diff))
      fi
  done << END
$1
END

    echo $LEAVING_TIME_S_SUM
}

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

# 業務記録(一日)を抽出
record=`echo "${extraction_log_by_date}" | grep "${name}" | awk -F , -v 'OFS=,' '{ print $1,$3,$4 }'`

# 氏名からuserIDを特定する
userID=`grep "${name}" ${log_filepath} | tail -n1 | awk -F , '{ print $8 }'`

# おおよその始業時刻を抽出
opening_record=`echo "${extraction_log_by_date}" | grep -e ${userID} -e '"-","-","-"' | head -n1 | awk -F , '{ print $1 }'`
opening_record=`date -d ${opening_record} "+%H:%m"`

# おおよその最終業務時刻を抽出
last_record=`echo "${extraction_log_by_date}" | grep -e ${userID} -e '"-","-","-"' | tail -n1 | awk -F , '{ print $1 }'`
last_record=`date -d ${last_record} "+%H:%m"`

output_record_date=`date -d ${yaer}${month}${day} "+%Y年%m月%d日(%A)"`
echo "========== ${name}さん ${output_record_date} の業務記録 =========="

# 指定した日付のデータが存在するかどうか
if [ -n "$record" -a -n "$last_record" ]; then
  echo "${record}"
  echo
  echo "勤務時間: ${opening_record} ～ ${last_record}"

  # 一日の離席時間の合計(秒)を計算
  leaving_time_s_sum=$(calcLeavingTime "$record")
  # 秒を分に変換
  leaving_time_m_sum=$((leaving_time_s_sum / 60))
  # 昼休憩を考慮し、離席時間から60分減算する
  if [ $leaving_time_m_sum -gt 60 ]; then
    leaving_time_m_sum=$((leaving_time_m_sum - 60))
  fi
  echo "離席時間: ${leaving_time_m_sum} 分"
else
  echo "業務記録はありません"
fi
