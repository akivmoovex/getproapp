# Pharmacy implementation

A dispense still requires `activeclinic.pharmacy.dispense`. A prescription for another patient is not dispensed. A prescription that is already dispensed is not dispensed again.

A new prescription stores the supplied prescriber. The later status update changes status and version only. It does not replace `prescriber_staff_id`. No allergy block and no substitution were added.
