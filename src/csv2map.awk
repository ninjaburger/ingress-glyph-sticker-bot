# Set the field separator to comma
BEGIN {
    FS = ",";
    print "const glyphSequencesMap = new Map(["
    currentKey = ""
}

# Process each line of the CSV
{
    key = $1;

    # If the key changes, close the previous array and start a new entry
    if (key != currentKey && NR > 1) {
        print "\t\t],"
        print "\t],"
    }

    # Start a new key entry if needed
    if (key != currentKey) {
        currentKey = key;
        printf "\t[\n\t\t\"%s\",\n\t\t[\n", key;
    }

    # Collect non-empty fields from columns 2 to 5
    values = "";
    for (i = 2; i <= NF; i++) {
        if ($i != "") {
            if (values != "") values = values ",";
            values = values "\"" $i "\"";
        }
    }

    # Print non-empty values as an array
    if (values != "") {
        printf "\t\t\t[%s],\n", values;
    }
}

# Close the final array and map
END {
    print "\t\t],"
    print "\t],"
    print "]);"
}
