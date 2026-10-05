import { Select } from 'antd'
import { nativeName, useLang } from '../i18n'

export default function LanguageSelect() {
  const { lang, setLang, languages } = useLang()
  return (
    <Select
      value={lang}
      onChange={setLang}
      size="small"
      style={{ width: 130 }}
      popupMatchSelectWidth={false}
      options={languages.map((code) => ({ value: code, label: nativeName(code) }))}
    />
  )
}
