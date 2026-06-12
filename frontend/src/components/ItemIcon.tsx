import { getIconUrl } from '../api'

interface Props {
  iconPath: string | null
  size?: number
  alt?: string
}

export default function ItemIcon({ iconPath, size = 32, alt = '' }: Props) {
  const url = getIconUrl(iconPath)
  if (!url)
    return (
      <span
        style={{
          width: size,
          height: size,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#444',
          fontSize: size * 0.5,
          flexShrink: 0,
        }}
      >
        ?
      </span>
    )
  return (
    <img
      src={url}
      alt={alt}
      width={size}
      height={size}
      style={{ objectFit: 'contain', flexShrink: 0 }}
    />
  )
}
