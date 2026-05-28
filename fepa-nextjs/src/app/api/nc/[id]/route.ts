import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'

type Params = { params: { id: string } }

export async function DELETE(_: NextRequest, { params }: Params) {
  const supabase = sb()
  const { error } = await supabase.from('comprobantes_nc_nd').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
