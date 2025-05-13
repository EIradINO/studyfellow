// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument } from 'pdf-lib'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { type, table, record, old_record } = body;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    if (table === 'objects') {
      if (record.bucket_id !== 'documents' && record.bucket_id !== 'workbooks') {
        console.log('Skipping non-target bucket:', record.bucket_id);
        return new Response(
          JSON.stringify({ message: '対象外のバケットです' }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      if (type === 'INSERT') {
        const fileName = record.name;
        const fileExtension = fileName.split('.').pop()?.toLowerCase();
        
        if (fileExtension !== 'pdf') {
          console.log('Skipping non-PDF file:', fileName);
          return new Response(
            JSON.stringify({ message: 'PDFファイルではありません' }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        
        const { data: fileData, error: downloadError } = await supabase.storage
          .from(record.bucket_id)
          .download(fileName);
          
        if (downloadError) {
          console.error('Download error:', downloadError);
          throw downloadError;
        }
        
        const pdfBytes = await fileData.arrayBuffer();
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const totalPages = pdfDoc.getPageCount();
        
        const { data, error } = await supabase
          .from('document_metadata')
          .insert({
            file_name: fileName,
            bucket: record.bucket_id,
            title: '',
            file_size: record.metadata.size,
            total_pages: totalPages,
            status: 'unprocessed'
          });
          
        if (error) {
          console.error('Insert error:', error);
          throw error;
        }
        
        console.log('Created metadata for:', fileName);
      } else if (type === 'DELETE') {
        if (old_record.bucket_id !== 'documents' && old_record.bucket_id !== 'workbooks') {
          console.log('Skipping non-target bucket:', old_record.bucket_id);
          return new Response(
            JSON.stringify({ message: '対象外のバケットです' }),
            { headers: { "Content-Type": "application/json" } },
          );
        }

        const fileName = old_record.name;
        
        const { data: existingData, error: checkError } = await supabase
          .from('document_metadata')
          .select()
          .eq('file_name', fileName)
          .eq('bucket', old_record.bucket_id)
          .single();
          
        if (checkError) {
          if (checkError.code === 'PGRST116') {
            console.log('Metadata not found for file:', fileName);
            return new Response(
              JSON.stringify({ 
                error: 'Metadata not found',
                message: `メタデータが見つかりません: ${fileName} (bucket: ${old_record.bucket_id})`
              }),
              { 
                status: 404,
                headers: { "Content-Type": "application/json" }
              }
            );
          }
          console.error('Check error:', checkError);
          throw checkError;
        }
        
        const { data, error } = await supabase
          .from('document_metadata')
          .update({ status: 'deleted' })
          .eq('file_name', fileName)
          .eq('bucket', old_record.bucket_id);
          
        if (error) {
          console.error('Update error:', error);
          throw error;
        }
        
        console.log('Updated status to deleted for:', fileName);
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error('Error occurred:', error);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/create-document-metadata' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
