# Fix Modal Flickering - Root Cause Analysis

## Problem

Modal berkedip saat tombol Edit diklik, bukan saat submit form.

## Root Cause

Event listener dengan **capture phase** (`true`) menangkap SEMUA submit event di document level, termasuk event yang tidak seharusnya, yang mungkin trigger saat modal dibuka.

## Solution

1. Hapus event listener dengan capture phase
2. Attach event listener langsung ke form edit setelah DOM ready
3. Hapus semua cleanup code yang mengganggu modal
4. Biarkan Bootstrap handle modal sepenuhnya

## Changes Made

- Changed from document-level capture phase listener to direct form attachment
- Removed all modal cleanup code that interferes with Bootstrap
- Simplified DOMContentLoaded to only initialize form fields
